import { beforeEach, describe, expect, it, vi } from 'vitest';

const document = {
  schemaVersion: 1,
  documentId: 'lyr_document',
  normalizerProfileId: 'lyrics-source-v2',
  source: { filename: 'main.lrc', sha256: 'a'.repeat(64) },
  granularity: 'T1',
  lines: [
    {
      lineId: 'line_01',
      text: 'Hello world',
      startMs: 1000,
      endMs: 3000,
    },
  ],
};

async function loadEditor() {
  const module = await import('./useLyricsTimingEditor.js');
  return module.useLyricsTimingEditor();
}

beforeEach(() => {
  vi.resetModules();
});

describe('useLyricsTimingEditor', () => {
  it('bounds undo history while retaining the most recent complete document snapshots', async () => {
    const editor = await loadEditor();
    editor.beginLine(document, 'line_01', null, null, { mode: 'line' });
    for (let i = 0; i < 120; i++) expect(editor.shiftLine(1)).toBe(true);
    let count = 0;
    while (editor.undo()) count++;
    expect(count).toBe(100);
    expect(editor.draft.value.startMs).toBe(1020);
  });
  it('keeps sentence edits and inferred neighbors in the same undoable draft without making T2', async () => {
    const editor = await loadEditor();
    const original = {
      ...document,
      lines: [
        { ...document.lines[0], text: '前', endInferred: true },
        { lineId: 'next', text: '後', startMs: 3000, endMs: null },
      ],
    };
    editor.beginLine(
      original,
      'next',
      null,
      { id: 'baseline' },
      { mode: 'line' },
    );
    expect(editor.shiftLine(200)).toBe(true);
    expect(editor.buildDocument().lines[0].endMs).toBe(3200);
    expect(editor.buildDocument().granularity).toBe('T1');
    expect(editor.setLineEnd(5000)).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(editor.draft.value.endMs).toBe(null);
    expect(original.lines[0].endMs).toBe(3000);
    expect(editor.sourceSession.value).toEqual({ id: 'baseline' });
    editor.cancel();
    expect(editor.buildDocument()).toBe(null);
  });
  it('combines sentence edits and explicitly enabled word timing in one source baseline', async () => {
    const editor = await loadEditor();
    expect(
      editor.beginLine(document, 'line_01', null, null, { mode: 'line' }),
    ).toBe(true);
    expect(editor.shiftLine(100)).toBe(true);
    expect(editor.canEnableSegments.value).toBe(true);
    expect(editor.enableSegments()).toBe(true);
    expect(editor.canCommit.value).toBe(false);
    expect(editor.tapBoundary(1700)).toBe(true);
    expect(editor.buildDocument().lines[0]).toMatchObject({
      startMs: 1100,
      endMs: 3100,
    });
    expect(editor.buildDocument().granularity).toBe('T2');
    editor.undo();
    editor.undo();
    expect(editor.buildDocument().granularity).toBe('T1');
  });
  it('blocks save after a rejected endpoint, and preserves authored native segment ids and null ends', async () => {
    const editor = await loadEditor();
    const value = {
      ...document,
      granularity: 'T2',
      lines: [
        {
          ...document.lines[0],
          segments: [
            {
              segmentId: 'only',
              text: 'Hello world',
              startMs: 1200,
              endMs: null,
            },
          ],
        },
      ],
    };
    editor.beginLine(value, 'line_01', null, null, { mode: 'line' });
    expect(editor.setLineEnd(3500)).toBe(true);
    expect(editor.setLineStart(1300)).toBe(false);
    expect(editor.canCommit.value).toBe(false);
    expect(editor.setLineStart(1000)).toBe(false);
    expect(editor.canCommit.value).toBe(true);
    expect(editor.buildDocument().lines[0].segments).toEqual(
      value.lines[0].segments,
    );
  });
  it('rejects a single-segment line instead of offering a 0/0 save', async () => {
    const editor = await loadEditor();
    expect(
      editor.beginLine(
        { ...document, lines: [{ ...document.lines[0], text: '歌う声' }] },
        'line_01',
      ),
    ).toBe(false);
    expect(editor.draft.value).toBe(null);
    expect(editor.canCommit.value).toBe(false);
  });
  it('reuses exact reading segments as suggestions, without inventing timestamps', async () => {
    const editor = await loadEditor();
    const japanese = {
      ...document,
      lines: [{ ...document.lines[0], text: '歌う声' }],
    };
    const reading = {
      lineId: 'line_01',
      text: '歌う声',
      segments: [{ t: '歌', r: 'うた' }, { t: 'う' }, { t: '声', r: 'こえ' }],
    };
    expect(editor.beginLine(japanese, 'line_01', reading)).toBe(true);
    expect(editor.draft.value.segments.map((x) => x.text).join('')).toBe(
      '歌う声',
    );
    expect(editor.draft.value.segments[1].startMs).toBe(null);
    expect(editor.canCommit.value).toBe(false);
    expect(
      editor.beginLine(japanese, 'line_01', { ...reading, text: 'stale' }),
    ).toBe(false);
  });
  it('suggests exact whitespace-preserving slices and never owns playback', async () => {
    const editor = await loadEditor();

    expect(editor.suggestSplitOffsets('Hello world')).toEqual([6]);
    expect(editor.suggestSplitOffsets('歌う声')).toEqual([]);
    editor.beginLine(document, 'line_01');

    expect(editor.draft.value.segments.map((segment) => segment.text)).toEqual([
      'Hello ',
      'world',
    ]);
    expect(editor.canCommit.value).toBe(false);
  });

  it('records tap boundaries, nudges them, and builds a new immutable document', async () => {
    const editor = await loadEditor();
    editor.beginLine(document, 'line_01');
    expect(editor.canUndo.value).toBe(false);

    expect(editor.tapBoundary(1600)).toBe(true);
    expect(editor.canUndo.value).toBe(true);
    expect(editor.canCommit.value).toBe(true);
    expect(editor.nudgeBoundary(1, 100)).toBe(true);

    const next = editor.buildDocument();
    expect(next).not.toBe(document);
    expect(document.lines[0]).not.toHaveProperty('segments');
    expect(next.lines[0].segments).toEqual([
      {
        segmentId: 'line_01_s_0',
        text: 'Hello ',
        startMs: 1000,
        endMs: 1700,
      },
      {
        segmentId: 'line_01_s_1',
        text: 'world',
        startMs: 1700,
        endMs: 3000,
      },
    ]);
    expect(next.granularity).toBe('T2');
  });

  it('supports undo and rejects out-of-range boundaries', async () => {
    const editor = await loadEditor();
    editor.beginLine(document, 'line_01');

    expect(editor.tapBoundary(500)).toBe(false);
    expect(editor.tapBoundary(1600)).toBe(true);
    expect(editor.undo()).toBe(true);
    expect(editor.canUndo.value).toBe(false);
    expect(editor.canCommit.value).toBe(false);
    expect(editor.buildDocument()).toBe(null);
  });

  it('cancels drafts and can edit an existing segmented line without changing ids', async () => {
    const editor = await loadEditor();
    const segmented = {
      ...document,
      granularity: 'T2',
      lines: [
        {
          ...document.lines[0],
          segments: [
            {
              segmentId: 'saved_1',
              text: 'Hello ',
              startMs: 1000,
              endMs: 1500,
            },
            {
              segmentId: 'saved_2',
              text: 'world',
              startMs: 1500,
              endMs: 3000,
            },
          ],
        },
      ],
    };

    editor.beginLine(segmented, 'line_01');
    expect(editor.canCommit.value).toBe(false);
    expect(editor.nudgeBoundary(1, 0)).toBe(false);
    expect(editor.nudgeBoundary(1, 100)).toBe(true);
    expect(editor.buildDocument().lines[0].segments[1]).toMatchObject({
      segmentId: 'saved_2',
      startMs: 1600,
    });
    editor.undo();
    expect(editor.canCommit.value).toBe(false);
    editor.cancel();
    expect(editor.draft.value).toBe(null);
  });
});
