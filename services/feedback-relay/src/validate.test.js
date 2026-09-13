import { describe, expect, it } from 'vitest';
import { validateFeedbackPayload } from './validate.js';
import { MAX_DESCRIPTION_LENGTH } from './constants.js';

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

  it('rejects a missing or empty reportId', () => {
    expect(validateFeedbackPayload(basePayload({ reportId: '' }))).toEqual({
      ok: false,
      reason: 'invalid-report-id',
    });
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
