import { describe, expect, it } from 'vitest';
import {
  selectLyricsFrame,
  selectNowPlayingFrame,
  selectSetlistFrame,
} from './state.mjs';

function snapshot(overrides = {}) {
  return {
    version: 1,
    revision: 8,
    playback: {
      status: 'playing',
      positionMs: 12000,
      durationMs: 180000,
      rate: 1,
      track: { id: 'track-1', title: '海螺記', artist: '163braces' },
    },
    queue: {
      sourceName: 'Tonight',
      items: [
        {
          state: 'played',
          track: { id: 'track-0', title: 'Intro', artist: 'Singer' },
        },
        {
          state: 'current',
          track: { id: 'track-1', title: '海螺記', artist: '163braces' },
        },
        {
          state: 'queued',
          track: { id: 'track-2', title: 'Next Song', artist: 'Singer' },
        },
      ],
    },
    lyrics: {
      trackId: 'track-1',
      source: { language: 'zh-Hant' },
      synced: true,
      offsetMs: 0,
      activeLineIndex: 1,
      lines: [
        { text: '上一句', startMs: 0, endMs: 9000 },
        { text: '潮聲沿著夜色靠岸', startMs: 9000, endMs: 15000 },
        { text: '   ', startMs: 15000, endMs: 16000 },
        { text: '下一句仍在遠方', startMs: 16000, endMs: 22000 },
      ],
    },
    ...overrides,
  };
}

describe('overlay state selectors', () => {
  it('selects the current and next non-empty lyric lines', () => {
    expect(selectLyricsFrame(snapshot())).toEqual({
      revision: 8,
      visible: true,
      currentText: '潮聲沿著夜色靠岸',
      nextText: '下一句仍在遠方',
      language: 'zh-Hant',
    });
  });

  it('hides lyrics that do not belong to the playing track', () => {
    const value = snapshot({
      lyrics: { ...snapshot().lyrics, trackId: 'another-track' },
    });
    expect(selectLyricsFrame(value)).toMatchObject({
      revision: 8,
      visible: false,
      currentText: '',
      nextText: '',
    });
  });

  it('selects now-playing and queue frames without media fields', () => {
    expect(selectNowPlayingFrame(snapshot())).toEqual({
      revision: 8,
      visible: true,
      title: '海螺記',
      artist: '163braces',
      nextTitle: 'Next Song',
    });

    expect(selectSetlistFrame(snapshot())).toEqual({
      revision: 8,
      visible: true,
      sourceName: 'Tonight',
      rows: [
        { state: 'played', title: 'Intro', artist: 'Singer' },
        { state: 'current', title: '海螺記', artist: '163braces' },
        { state: 'queued', title: 'Next Song', artist: 'Singer' },
      ],
    });
  });
});
