import { describe, expect, it } from 'vitest';
import {
  createLocalArtistSummary,
  createTrackLyricsPreview,
  createTrackReadiness,
} from './trackContextPresentation.js';

describe('track context presentation', () => {
  it('projects the active lyric plus two following lines for the fixed preview', () => {
    expect(
      createTrackLyricsPreview({
        currentTrackId: 'track-1',
        selectedTrackId: 'track-1',
        activeLineIndex: 1,
        lines: [
          { lineId: 'line-0', text: 'Earlier' },
          { lineId: 'line-1', text: 'Current line' },
          { lineId: 'line-2', text: 'Next line' },
          { lineId: 'line-3', text: 'Faded line' },
        ],
        source: { kind: 'manual', label: '演出修訂版' },
      }),
    ).toEqual({
      lines: [
        { id: 'line-1', text: 'Current line', active: true },
        { id: 'line-2', text: 'Next line', active: false },
        { id: 'line-3', text: 'Faded line', active: false },
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

  it('uses the first three non-empty lines for a prepared or untimed preview', () => {
    expect(
      createTrackLyricsPreview({
        currentTrackId: 'track-1',
        selectedTrackId: 'track-1',
        activeLineIndex: -1,
        lines: [
          { text: '  ' },
          { text: 'First' },
          { text: 'Second' },
          { text: 'Third' },
        ],
      })?.lines,
    ).toEqual([
      { id: 'line-1', text: 'First', active: true },
      { id: 'line-2', text: 'Second', active: false },
      { id: 'line-3', text: 'Third', active: false },
    ]);
  });

  it('preloads the first readable lines before a timed cue starts', () => {
    expect(
      createTrackLyricsPreview({
        currentTrackId: 'track-1',
        selectedTrackId: 'track-1',
        activeLineIndex: -1,
        lines: [{ text: 'Opening line' }, { text: 'Next line' }],
      })?.lines,
    ).toEqual([
      { id: 'line-0', text: 'Opening line', active: true },
      { id: 'line-1', text: 'Next line', active: false },
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

  it('uses the artist index for a stable destination, photo, and membership', () => {
    expect(
      createLocalArtistSummary(
        { id: 'current', artist: 'SmoovLee' },
        [
          { id: '1', artist: 'SmoovLee', album: 'Night' },
          { id: '2', artist: 'SmoovLee, Guest', album: 'Dawn' },
          { id: 'other', artist: 'Other', album: 'Elsewhere' },
        ],
        {
          artists: [
            {
              id: 'artist-1234567890abcdef',
              name: 'SmoovLee',
              photoUrl: 'utawakui-media://artist/photo.jpg',
              trackIds: ['1', '2'],
            },
          ],
          trackArtistIds: {
            current: ['artist-1234567890abcdef'],
          },
        },
      ),
    ).toMatchObject({
      artistId: 'artist-1234567890abcdef',
      name: 'SmoovLee',
      photoUrl: 'utawakui-media://artist/photo.jpg',
      trackCount: 2,
      albumCount: 2,
    });
  });

  it('uses the first credited artist for collaborations while preserving full credits', () => {
    const current = Object.freeze({
      id: 'collaboration',
      artist: '高爾宣 OSN, Skot Suyama 陶山',
      album: '#osnrap',
    });
    const solo = { id: 'solo', artist: 'OSN', album: 'Another album' };
    const guestSolo = { id: 'guest-solo', artist: 'Skot Suyama 陶山' };
    const index = {
      artists: [
        {
          id: 'artist-guest',
          name: 'Skot Suyama 陶山',
          trackIds: [current.id, guestSolo.id],
        },
        {
          id: 'artist-primary',
          name: '高爾宣 OSN',
          photoUrl: 'utawakui-media://artist/primary/photo.jpg',
          trackIds: [current.id, solo.id],
        },
      ],
      trackArtistIds: {
        [current.id]: Object.freeze(['artist-primary', 'artist-guest']),
      },
    };

    expect(
      createLocalArtistSummary(current, [current, solo, guestSolo], index),
    ).toEqual({
      artistId: 'artist-primary',
      name: '高爾宣 OSN',
      photoUrl: 'utawakui-media://artist/primary/photo.jpg',
      trackCount: 2,
      albumCount: 2,
      tracks: [current, solo],
    });
    expect(current.artist).toBe('高爾宣 OSN, Skot Suyama 陶山');
    expect(index.trackArtistIds[current.id]).toEqual([
      'artist-primary',
      'artist-guest',
    ]);
  });

  it.each([
    null,
    { artists: [], trackArtistIds: {} },
    {
      artists: [{ id: 'guest', name: 'Guest', trackIds: ['current'] }],
      trackArtistIds: { current: ['missing-primary', 'guest'] },
    },
  ])(
    'keeps the complete credit when the primary artist cannot be resolved (%j)',
    (index) => {
      const current = {
        id: 'current',
        artist: 'Singer, Guest',
        album: 'Album',
      };
      expect(createLocalArtistSummary(current, [current], index)).toEqual({
        name: 'Singer, Guest',
        trackCount: 1,
        albumCount: 1,
        tracks: [current],
      });
    },
  );

  it('projects local track capabilities in natural language without overstating playback state', () => {
    expect(
      createTrackReadiness(
        {
          lyrics: { status: 'available', sources: [{ filename: 'main.lrc' }] },
          hasSeparation: true,
        },
        {
          document: {
            granularity: 'T1',
            lines: [{ lineId: 'line-1', text: 'Current line', startMs: 0 }],
          },
        },
      ),
    ).toEqual([
      {
        id: 'lyrics',
        label: '歌詞',
        status: '逐行同步',
        tone: 'success',
        description: '歌詞包含逐行時間，可跟隨播放進度。',
      },
      {
        id: 'separation',
        label: '人聲分離',
        status: '素材已準備',
        tone: 'success',
        description: '伴奏與導唱聲道素材已準備。',
      },
    ]);

    expect(
      createTrackReadiness({
        lyrics: { status: 'missing', sources: [] },
        hasSeparation: false,
      }),
    ).toEqual([
      {
        id: 'lyrics',
        label: '歌詞',
        status: '尚未取得',
        tone: 'muted',
        description: '目前沒有可用歌詞素材。',
      },
      {
        id: 'separation',
        label: '人聲分離',
        status: '尚未準備',
        tone: 'muted',
        description: '尚未產生伴奏與導唱聲道素材。',
      },
    ]);
  });

  it.each([
    {
      granularity: 'T0',
      lines: [{ lineId: 'line-1', text: 'Plain lyric' }],
      expected: '純文字',
    },
    {
      granularity: 'T2',
      lines: [
        {
          lineId: 'line-1',
          text: 'Fully timed',
          segments: [{ segmentId: 'segment-1', text: 'Fully', startMs: 0 }],
        },
      ],
      expected: '完整逐字同步',
    },
    {
      granularity: 'T2',
      lines: [
        {
          lineId: 'line-1',
          text: 'Partly timed',
          segments: [{ segmentId: 'segment-1', text: 'Partly', startMs: 0 }],
        },
        { lineId: 'line-2', text: 'Line timing only', startMs: 1000 },
      ],
      expected: '部分逐字同步',
    },
  ])(
    'describes $expected lyrics without exposing internal tier names',
    ({ granularity, lines, expected }) => {
      const [lyrics] = createTrackReadiness(
        { lyrics: { status: 'available' } },
        { document: { granularity, lines } },
      );

      expect(lyrics.status).toBe(expected);
      expect(lyrics.status).not.toMatch(/T[0-2]/u);
    },
  );

  it('keeps asynchronous lyric states truthful while the document is unavailable', () => {
    expect(
      createTrackReadiness(
        { lyrics: { status: 'available' } },
        { isLoading: true },
      )[0],
    ).toMatchObject({ status: '讀取中', tone: 'info' });
    expect(
      createTrackReadiness(
        { lyrics: { status: 'available' } },
        { error: new Error('private detail') },
      )[0],
    ).toMatchObject({ status: '暫時無法讀取', tone: 'danger' });
  });
});
