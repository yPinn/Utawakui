import { beforeEach, describe, expect, it, vi } from 'vitest';

const document = {
  schemaVersion: 1,
  documentId: 'lyr_document',
  normalizerProfileId: 'lyrics-source-v1',
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
    expect(editor.nudgeBoundary(1, 100)).toBe(true);
    expect(editor.buildDocument().lines[0].segments[1]).toMatchObject({
      segmentId: 'saved_2',
      startMs: 1600,
    });
    editor.cancel();
    expect(editor.draft.value).toBe(null);
  });
});
