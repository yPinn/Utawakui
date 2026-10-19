import { describe, expect, it } from 'vitest';
import {
  prepareAcousticPreview,
  selectAcousticPreviewFrame,
} from './lyricsAcousticPreview.mjs';

function fixture() {
  const document = {
    documentId: 'doc-1',
    normalizerProfileId: 'lyrics-source-v2',
    source: { filename: 'main.lrc', sha256: 'a'.repeat(64) },
    granularity: 'T1',
    lines: [{ lineId: 'line-1', text: '你好世界', startMs: 1000, endMs: 4000 }],
  };
  const estimate = {
    status: 'ready',
    preview: {
      estimateId: 'estimate-1',
      documentId: document.documentId,
      sourceFilename: 'main.lrc',
      sourceFingerprint: document.source.sha256,
      normalizerProfileId: document.normalizerProfileId,
      offsetUsedMs: 0,
      methodKind: 'fixture',
      lines: [
        {
          ...document.lines[0],
          status: 'ready',
          reason: null,
          chunks: [
            { chunkId: 'c-1', from: 0, to: 2, startMs: 1000 },
            { chunkId: 'c-2', from: 2, to: 4, startMs: 2700 },
          ],
        },
      ],
    },
  };
  return { document, estimate };
}
const prepare = (f = fixture(), offsetMs = 0) =>
  prepareAcousticPreview(f.document, f.estimate, offsetMs);
const frame = (f, enabled = true, positionMs = 2600, offsetMs = 0) =>
  selectAcousticPreviewFrame(f.document, prepare(f, offsetMs), {
    enabled,
    positionMs,
    offsetMs,
  });

describe('shared chunk preview precedence and fallback', () => {
  it('holds supported starts without inventing sung ends or sweep progress', () => {
    const result = frame(fixture());
    expect(result).toMatchObject({
      timingSource: 'acoustic-estimate',
      mode: 'starts',
      chunks: [
        { text: '你好', state: 'active' },
        { text: '世界', state: 'upcoming' },
      ],
    });
    expect(
      result.chunks.every((c) => !('endMs' in c) && !('progress' in c)),
    ).toBe(true);
    expect(frame(fixture(), true, 2700).chunks[1].state).toBe('active');
    expect(
      frame(fixture(), true, 4000).chunks.every((c) => c.state === 'past'),
    ).toBe(true);
  });

  it('uses the exact existing weighted T1 fallback when disabled or unavailable', () => {
    const f = fixture();
    const result = frame(f, false);
    expect(result.timingSource).toBe('line-estimate');
    expect(result.chunks.map((c) => [c.text, c.startMs])).toEqual([
      ['你', 1000],
      ['好', 1750],
      ['世', 2500],
      ['界', 3250],
    ]);
    f.estimate = { status: 'missing' };
    expect(frame(f).chunks).toEqual(result.chunks);
  });

  it('keeps authored T2 authoritative even with an enabled estimate', () => {
    const f = fixture();
    f.document.granularity = 'T2';
    f.document.lines[0].segments = [
      { segmentId: 's-1', text: '你好', startMs: 1000, endMs: 2000 },
      { segmentId: 's-2', text: '世界', startMs: 2000, endMs: 4000 },
    ];
    expect(frame(f)).toMatchObject({
      timingSource: 't2',
      chunks: [{ startMs: 1000 }, { startMs: 2000, state: 'active' }],
    });
  });

  it.each([
    'documentId',
    'sourceFilename',
    'sourceFingerprint',
    'normalizerProfileId',
    'offsetUsedMs',
    'text',
    'interval',
    'chunk',
  ])('rejects mismatched %s and preserves fallback', (field) => {
    const f = fixture();
    if (field === 'text') f.estimate.preview.lines[0].text = '不相同';
    else if (field === 'interval') f.estimate.preview.lines[0].startMs = 1100;
    else if (field === 'chunk') f.estimate.preview.lines[0].chunks[0].to = 1;
    else
      f.estimate.preview[field] = field === 'offsetUsedMs' ? 100 : 'different';
    expect(prepare(f).status).not.toBe('ready');
    expect(frame(f).timingSource).toBe('line-estimate');
  });

  it('declines converted text instead of guessing equal-length range mapping', () => {
    const f = fixture();
    f.document.lines[0].text = '妳好世界';
    expect(prepare(f).status).toBe('stale');
  });

  it.each([200, -200])(
    'consumes an already offset-adjusted lyric clock exactly once (%d)',
    (offset) => {
      const f = fixture();
      f.estimate.preview.offsetUsedMs = offset;
      const result = frame(f, true, 2700, offset);
      expect(result.chunks[1].state).toBe('active');
      expect(frame(f, true, 2699, offset).chunks[1].state).toBe('upcoming');
    },
  );

  it('uses plain presentation for an unresolved interval and never loses T0 text', () => {
    const f = fixture();
    f.document.granularity = 'T0';
    Object.assign(f.document.lines[0], { startMs: null, endMs: null });
    expect(frame(f)).toMatchObject({
      timingSource: 'plain',
      chunks: [{ text: '你好世界' }],
    });
    expect(
      selectAcousticPreviewFrame({ lines: [] }, { status: 'missing' }, {}),
    ).toBeNull();
  });

  it('keeps occurrence order and supports backwards seeking without persistent progress', () => {
    const f = fixture();
    const second = {
      ...f.document.lines[0],
      lineId: 'line-2',
      startMs: 5000,
      endMs: 8000,
    };
    f.document.lines.push(second);
    f.estimate.preview.lines.push({
      ...second,
      status: 'unsupported',
      reason: 'missing-boundaries',
      chunks: [],
    });
    expect(frame(f, true, 6000).timingSource).toBe('line-estimate');
    expect(frame(f, true, 6000).lineId).toBe('line-2');
    expect(frame(f, true, 1200).chunks[1].state).toBe('upcoming');
  });

  it('preserves canonical whitespace on the existing fallback without changing weighted starts', () => {
    const f = fixture();
    f.document.lines[0].text = ' 你好世界\n';
    const result = frame(f, false);
    expect(result.chunks.map((chunk) => chunk.text).join('')).toBe(
      f.document.lines[0].text,
    );
    expect(result.chunks.map((chunk) => chunk.startMs)).toEqual([
      1000, 1750, 2500, 3250,
    ]);
  });
});
