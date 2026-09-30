import { describe, expect, it } from 'vitest';
import {
  createLocalArtistSummary,
  createTrackLyricsPreview,
  createTrackReadiness,
} from './trackContextPresentation.js';

describe('track context presentation', () => {
  it('projects the active lyric and its next readable line for the current track', () => {
    expect(
      createTrackLyricsPreview({
        currentTrackId: 'track-1',
        selectedTrackId: 'track-1',
        activeLineIndex: 1,
        lines: [
          { lineId: 'line-0', text: 'Earlier' },
          { lineId: 'line-1', text: 'Current line' },
          { lineId: 'line-2', text: 'Next line' },
        ],
        source: { kind: 'manual', label: '演出修訂版' },
      }),
    ).toEqual({
      lines: [
        { id: 'line-1', text: 'Current line', active: true },
        { id: 'line-2', text: 'Next line', active: false },
      ],
      sourceLabel: '手動匯入 / 演出修訂版',
    });
  });

  it('does not leak a selected lyric document from a different track', () => {
    expect(
      createTrackLyricsPreview({
        currentTrackId: 'track-1',
        selectedTrackId: 'track-2',
        activeLineIndex: 0,
        lines: [{ text: 'Wrong track' }],
      }),
    ).toBeNull();
  });

  it('uses the first two non-empty lines before playback has an active line', () => {
    expect(
      createTrackLyricsPreview({
        currentTrackId: 'track-1',
        selectedTrackId: 'track-1',
        activeLineIndex: -1,
        lines: [{ text: '  ' }, { text: 'First' }, { text: 'Second' }],
      })?.lines,
    ).toEqual([
      { id: 'line-1', text: 'First', active: true },
      { id: 'line-2', text: 'Second', active: false },
    ]);
  });

  it('keeps the preview at the last readable line when playback is past the final lyric', () => {
    expect(
      createTrackLyricsPreview({
        currentTrackId: 'track-1',
        selectedTrackId: 'track-1',
        activeLineIndex: 12,
        lines: [{ text: 'First' }, { text: 'Final line' }],
      })?.lines,
    ).toEqual([{ id: 'line-1', text: 'Final line', active: true }]);
  });

  it('derives a local-only artist summary without social or biography claims', () => {
    expect(
      createLocalArtistSummary({ artist: 'SmoovLee' }, [
        { id: '1', artist: 'SmoovLee', album: 'Night', thumbnailUrl: 'a' },
        { id: '2', artist: 'smoovlee', album: 'Night' },
        { id: '3', artist: 'SmoovLee', album: 'Dawn' },
        { id: '4', artist: 'Other', album: 'Elsewhere' },
      ]),
    ).toEqual({
      name: 'SmoovLee',
      trackCount: 3,
      albumCount: 2,
      tracks: [
        { id: '1', artist: 'SmoovLee', album: 'Night', thumbnailUrl: 'a' },
        { id: '2', artist: 'smoovlee', album: 'Night' },
        { id: '3', artist: 'SmoovLee', album: 'Dawn' },
      ],
    });
  });

  it('reports only readiness that exists in the local track contract', () => {
    expect(
      createTrackReadiness({
        lyrics: { status: 'available', sources: [{ filename: 'main.lrc' }] },
        hasSeparation: true,
      }),
    ).toEqual([
      { id: 'lyrics', label: '歌詞可用', tone: 'success' },
      { id: 'separation', label: '分離素材可用', tone: 'success' },
    ]);

    expect(
      createTrackReadiness({
        lyrics: { status: 'missing', sources: [] },
        hasSeparation: false,
      }),
    ).toEqual([
      { id: 'lyrics', label: '尚無歌詞', tone: 'muted' },
      { id: 'separation', label: '尚無分離素材', tone: 'muted' },
    ]);
  });
});
