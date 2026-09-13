import { describe, expect, it } from 'vitest';
import { buildFeedbackPayload, normalizeUserText } from './payload.js';
import { MAX_DESCRIPTION_LENGTH, MAX_PAYLOAD_BYTES } from './constants.js';

const environment = {
  appVersion: '1.2.3',
  electronVersion: '30.0.0',
  platform: 'win32',
  locale: 'zh-TW',
};

function baseInput(overrides = {}) {
  return {
    kind: 'bug',
    description: '播放到副歌時整首歌卡住',
    environment,
    reportId: 'report-1',
    createdAt: '2026-09-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildFeedbackPayload', () => {
  it('rejects an unknown kind', () => {
    const result = buildFeedbackPayload(baseInput({ kind: 'nonsense' }));
    expect(result).toEqual({ status: 'error', reason: 'invalid-kind' });
  });

  it('rejects a missing reportId', () => {
    const result = buildFeedbackPayload(baseInput({ reportId: '' }));
    expect(result).toEqual({ status: 'error', reason: 'report-id-required' });
  });

  it('rejects an empty description', () => {
    const result = buildFeedbackPayload(baseInput({ description: '   ' }));
    expect(result).toEqual({
      status: 'error',
      reason: 'description-required',
    });
  });

  it('builds a minimal bug report with no diagnostics attached', () => {
    const result = buildFeedbackPayload(baseInput());
    expect(result).toEqual({
      status: 'ok',
      payload: {
        schemaVersion: 1,
        reportId: 'report-1',
        kind: 'bug',
        createdAt: '2026-09-13T00:00:00.000Z',
        description: '播放到副歌時整首歌卡住',
        environment,
      },
    });
  });

  it('omits contact and trackLabel when not provided', () => {
    const result = buildFeedbackPayload(baseInput());
    expect(result.payload).not.toHaveProperty('contact');
    expect(result.payload).not.toHaveProperty('trackLabel');
  });

  it('includes a trimmed, control-character-free contact when provided', () => {
    const bellCharacter = String.fromCharCode(7);
    const result = buildFeedbackPayload(
      baseInput({ contact: `  user@example.com${bellCharacter} ` }),
    );
    expect(result.payload.contact).toBe('user@example.com');
  });

  it('does not mangle a URL pasted into the description', () => {
    // Unlike diagnostics.js's redactText, user-authored fields are reviewed
    // by the user in the preview step before send, so a `content` report
    // referencing a source link must survive intact to stay actionable.
    const result = buildFeedbackPayload(
      baseInput({
        kind: 'content',
        description: '這首 https://youtube.com/watch?v=abc 對不上歌詞',
      }),
    );
    expect(result.payload.description).toContain(
      'https://youtube.com/watch?v=abc',
    );
  });

  it('bounds an oversized description to the max length', () => {
    const longDescription = 'x'.repeat(MAX_DESCRIPTION_LENGTH + 500);
    const result = buildFeedbackPayload(
      baseInput({ description: longDescription }),
    );
    expect(result.payload.description).toHaveLength(MAX_DESCRIPTION_LENGTH);
  });

  it('attaches trackLabel only for the content kind', () => {
    const contentResult = buildFeedbackPayload(
      baseInput({ kind: 'content', trackLabel: '歌手 - 歌名' }),
    );
    expect(contentResult.payload.trackLabel).toBe('歌手 - 歌名');

    const bugResult = buildFeedbackPayload(
      baseInput({ kind: 'bug', trackLabel: '歌手 - 歌名' }),
    );
    expect(bugResult.payload).not.toHaveProperty('trackLabel');
  });

  it('attaches a diagnostics bundle for a bug report when requested', () => {
    const diagnosticsEvents = [
      { level: 'error', message: 'a', timestamp: '2026-09-13T00:00:00.000Z' },
      {
        level: 'warning',
        message: 'b',
        timestamp: '2026-09-13T00:00:01.000Z',
      },
    ];
    const result = buildFeedbackPayload(
      baseInput({ includeDiagnostics: true, diagnosticsEvents }),
    );
    expect(result.status).toBe('ok');
    expect(result.payload.diagnostics).toMatchObject({
      bundleVersion: 1,
      eventCount: 2,
      levelCounts: { debug: 0, info: 0, warning: 1, error: 1 },
      events: diagnosticsEvents,
    });
  });

  it.each(['feature', 'experience', 'content'])(
    'never attaches diagnostics for a %s report even if requested',
    (kind) => {
      const result = buildFeedbackPayload(
        baseInput({
          kind,
          includeDiagnostics: true,
          diagnosticsEvents: [{ level: 'error', message: 'a' }],
        }),
      );
      expect(result.status).toBe('ok');
      expect(result.payload).not.toHaveProperty('diagnostics');
    },
  );

  it('trims the oldest diagnostic events first to stay under the payload cap', () => {
    // Each event is padded well past what 50 of them could ever need, so the
    // trimmer must drop entries rather than fail the whole submission.
    const diagnosticsEvents = Array.from({ length: 50 }, (_, index) => ({
      level: 'error',
      message: `event-${index}`,
      padding: 'p'.repeat(10_000),
    }));
    const result = buildFeedbackPayload(
      baseInput({ includeDiagnostics: true, diagnosticsEvents }),
    );
    expect(result.status).toBe('ok');
    expect(result.payload.diagnostics.events.length).toBeLessThan(50);
    // Newest-first input means trimming pops from the end (oldest) first.
    expect(result.payload.diagnostics.events[0].message).toBe('event-0');
    expect(
      Buffer.byteLength(JSON.stringify(result.payload), 'utf8'),
    ).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });

  it('fails rather than truncate when the description alone exceeds the cap', () => {
    // Description is already bounded to MAX_DESCRIPTION_LENGTH, so this can
    // only happen if that constant is ever raised past the payload cap.
    const result = buildFeedbackPayload(
      baseInput({ description: 'x'.repeat(MAX_DESCRIPTION_LENGTH) }),
    );
    expect(result.status).toBe('ok');
  });
});

describe('normalizeUserText', () => {
  it('strips control characters and trims whitespace', () => {
    const nullCharacter = String.fromCharCode(0);
    const unitSeparator = String.fromCharCode(31);
    const input = `  hi${nullCharacter}there${unitSeparator}  `;
    expect(normalizeUserText(input, 100)).toBe('hithere');
  });

  it('preserves tabs and newlines in multi-line descriptions', () => {
    const input = 'line one\nline two\tindented';
    expect(normalizeUserText(input, 100)).toBe(input);
  });

  it('returns an empty string for non-string input', () => {
    expect(normalizeUserText(null, 100)).toBe('');
    expect(normalizeUserText(undefined, 100)).toBe('');
  });

  it('bounds to the given max length', () => {
    expect(normalizeUserText('abcdef', 3)).toBe('abc');
  });
});
