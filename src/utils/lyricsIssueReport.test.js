import { describe, expect, it } from 'vitest';
import { buildLyricsIssueReport } from './lyricsIssueReport.js';

describe('lyrics issue draft projection', () => {
  it('captures only bounded visible candidate context without adopting timing or lyrics', () => {
    const input = {
      track: { title: 'Local song', artist: 'Artist', id: 'private-track' },
      candidate: {
        id: 42,
        providerId: 'netease',
        trackName: 'Other song',
        artistName: 'Other artist',
        capability: { level: 'T2', partial: true },
        previewLines: [{ text: 'PRIVATE LYRICS' }],
        previewFingerprint: 'private-hash',
        filename: 'C:/private/song.lrc',
        url: 'https://private',
      },
    };
    const before = structuredClone(input);
    const draft = buildLyricsIssueReport(input);
    expect(draft.kind).toBe('content');
    expect(draft.trackLabel).toBe('Artist - Local song');
    expect(draft.description).toContain('網易雲音樂 #42');
    expect(draft.description).toContain('Other artist - Other song');
    expect(draft.description).toContain('T2（部分）');
    expect(draft.description).toContain('重現步驟：');
    expect(JSON.stringify(draft)).not.toMatch(
      /PRIVATE|private|offsetMs|previewFingerprint/,
    );
    expect(input).toEqual(before);
  });

  it('describes saved source offset as context without copying the authored document', () => {
    const draft = buildLyricsIssueReport({
      track: { title: 'Song' },
      source: {
        kind: 'lrclib',
        provider: { recordId: 17 },
        filename: 'private.lrc',
        timing: { lines: ['PRIVATE'] },
      },
      tier: 'T2',
      offsetMs: -1200,
    });
    expect(draft.description).toContain('已保存來源');
    expect(draft.description).toContain('LRCLIB #17');
    expect(draft.description).toContain('-1200 ms');
    expect(JSON.stringify(draft)).not.toMatch(/private|PRIVATE|lines/);
  });

  it('limits text, strips controls and rejects untrusted identifiers and unknown enum values', () => {
    const draft = buildLyricsIssueReport({
      track: { title: 'a'.repeat(2000) + '\u0000\nPRIVATE', artist: 'Artist' },
      candidate: {
        id: 'https://private',
        providerId: 'C:/private',
        trackName: 'b'.repeat(4000),
        capability: { level: 'private' },
      },
      offsetMs: Infinity,
    });
    expect(draft.trackLabel.length).toBeLessThanOrEqual(200);
    expect(draft.description.length).toBeLessThanOrEqual(2000);
    expect(JSON.stringify(draft)).not.toMatch(/private|PRIVATE|\\u0000/);
    expect(draft.description).toContain('線上來源');
    expect(draft.description).toContain('未確認');
    expect(buildLyricsIssueReport().description).not.toContain('undefined');
  });
});
