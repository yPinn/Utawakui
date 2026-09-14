import { describe, expect, it } from 'vitest';
import { validateFeedbackPayload } from './validate.js';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_ENVIRONMENT_VALUE_LENGTH,
} from './constants.js';

function basePayload(overrides = {}) {
  return {
    schemaVersion: 1,
    reportId: 'report-1',
    kind: 'bug',
    createdAt: '2026-09-13T00:00:00.000Z',
    description: '整首歌卡住',
    environment: { appVersion: '1.0.0', electronVersion: '30.0.0' },
    ...overrides,
  };
}

describe('validateFeedbackPayload', () => {
  it('accepts a well-formed payload', () => {
    expect(validateFeedbackPayload(basePayload())).toEqual({ ok: true });
  });

  it('rejects a non-object payload', () => {
    expect(validateFeedbackPayload(null)).toEqual({
      ok: false,
      reason: 'invalid-payload',
    });
    expect(validateFeedbackPayload('nope')).toEqual({
      ok: false,
      reason: 'invalid-payload',
    });
  });

  it('rejects an unknown kind', () => {
    expect(validateFeedbackPayload(basePayload({ kind: 'nonsense' }))).toEqual({
      ok: false,
      reason: 'invalid-kind',
    });
  });

  it('rejects an unsupported schema version', () => {
    expect(validateFeedbackPayload(basePayload({ schemaVersion: 2 }))).toEqual({
      ok: false,
      reason: 'invalid-schema-version',
    });
  });

  it('rejects a missing or empty reportId', () => {
    expect(validateFeedbackPayload(basePayload({ reportId: '' }))).toEqual({
      ok: false,
      reason: 'invalid-report-id',
    });
  });

  it('rejects a reportId that is unsafe as an attachment label', () => {
    expect(
      validateFeedbackPayload(basePayload({ reportId: '../report' })),
    ).toEqual({ ok: false, reason: 'invalid-report-id' });
  });

  it('rejects a description over the max length', () => {
    expect(
      validateFeedbackPayload(
        basePayload({ description: 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1) }),
      ),
    ).toEqual({ ok: false, reason: 'invalid-description' });
  });

  it('rejects a missing createdAt', () => {
    expect(validateFeedbackPayload(basePayload({ createdAt: '' }))).toEqual({
      ok: false,
      reason: 'invalid-created-at',
    });
  });

  it('rejects a malformed creation timestamp', () => {
    expect(
      validateFeedbackPayload(basePayload({ createdAt: 'not-a-date' })),
    ).toEqual({ ok: false, reason: 'invalid-created-at' });
  });

  it('rejects a parseable but non-canonical creation timestamp', () => {
    expect(
      validateFeedbackPayload(
        basePayload({ createdAt: 'September 13, 2026 00:00:00 UTC' }),
      ),
    ).toEqual({ ok: false, reason: 'invalid-created-at' });
  });

  it('requires a bounded environment projection', () => {
    expect(validateFeedbackPayload(basePayload({ environment: null }))).toEqual(
      { ok: false, reason: 'invalid-environment' },
    );
    expect(
      validateFeedbackPayload(
        basePayload({
          environment: {
            appVersion: 'x'.repeat(MAX_ENVIRONMENT_VALUE_LENGTH + 1),
            electronVersion: '30.0.0',
          },
        }),
      ),
    ).toEqual({ ok: false, reason: 'invalid-environment' });
  });

  it('accepts a payload without optional contact/trackLabel', () => {
    const payload = basePayload();
    expect(validateFeedbackPayload(payload)).toEqual({ ok: true });
  });

  it('rejects an oversized optional contact', () => {
    expect(
      validateFeedbackPayload(basePayload({ contact: 'x'.repeat(500) })),
    ).toEqual({ ok: false, reason: 'invalid-contact' });
  });

  it('rejects a non-object diagnostics field', () => {
    expect(
      validateFeedbackPayload(basePayload({ diagnostics: 'not-an-object' })),
    ).toEqual({ ok: false, reason: 'invalid-diagnostics' });
  });

  it('accepts the bounded diagnostics bundle produced by the app', () => {
    expect(
      validateFeedbackPayload(
        basePayload({
          diagnostics: {
            eventCount: 1,
            events: [{ level: 'error', message: 'playback failed' }],
          },
        }),
      ),
    ).toEqual({ ok: true });
  });

  it.each([
    [{ eventCount: 1 }, 'missing events'],
    [{ eventCount: -1, events: [] }, 'negative count'],
    [{ eventCount: 1.5, events: [] }, 'fractional count'],
    [{ eventCount: 51, events: Array.from({ length: 51 }) }, 'too many events'],
    [{ eventCount: 2, events: [{}] }, 'mismatched count'],
  ])('rejects diagnostics with %s (%s)', (diagnostics) => {
    expect(validateFeedbackPayload(basePayload({ diagnostics }))).toEqual({
      ok: false,
      reason: 'invalid-diagnostics',
    });
  });

  it('rejects diagnostics attached to a non-bug report', () => {
    expect(
      validateFeedbackPayload(
        basePayload({ kind: 'feature', diagnostics: { events: [] } }),
      ),
    ).toEqual({ ok: false, reason: 'diagnostics-not-allowed' });
  });

  it('rejects track metadata attached to a non-content report', () => {
    expect(
      validateFeedbackPayload(basePayload({ trackLabel: 'artist - title' })),
    ).toEqual({ ok: false, reason: 'track-label-not-allowed' });
  });

  it('rejects a payload larger than the byte ceiling', () => {
    const oversized = basePayload({
      diagnostics: { events: [{ padding: 'p'.repeat(400_000) }] },
    });
    expect(validateFeedbackPayload(oversized)).toEqual({
      ok: false,
      reason: 'payload-too-large',
    });
  });
});
