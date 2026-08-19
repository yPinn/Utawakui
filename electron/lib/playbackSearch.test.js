import { describe, it, expect, vi } from 'vitest';
import {
  buildPlaybackCrossSearchQueries,
  buildPlaybackSearchQueries,
  searchPlaybackCandidates,
} from './playbackSearch.js';

describe('searchPlaybackCandidates', () => {
  it('builds query variants from title, artist order, and collaborator names', () => {
    expect(
      buildPlaybackSearchQueries(
        {
          title: '\u964d\u843d\u5098',
          artist: 'Sabrina \u80e1\u6062\u821e, \u738b\u8b19Goatak',
        },
        {
          title:
            'Sabrina \u80e1\u6062\u821e - \u964d\u843d\u5098 (\u5408\u4f5c\u6f14\u51fa\uff1a\u738b\u8b19Goatak)',
        },
      ),
    ).toEqual([
      'Sabrina \u80e1\u6062\u821e \u964d\u843d\u5098',
      '\u964d\u843d\u5098 Sabrina \u80e1\u6062\u821e',
      '\u738b\u8b19Goatak \u964d\u843d\u5098',
      '\u964d\u843d\u5098',
    ]);
  });

  it('builds query variants from TrackIdentity artists', () => {
    expect(
      buildPlaybackSearchQueries(
        {
          title: 'Parachute',
          artists: ['Sabrina Hu', 'Goatak'],
          duration: 211,
          sourcePlatform: 'spotify',
        },
        {},
      ),
    ).toEqual([
      'Sabrina Hu Parachute',
      'Parachute Sabrina Hu',
      'Goatak Parachute',
      'Parachute',
    ]);
  });

  it('does not dash-split track-provider titles into fake artist queries', () => {
    expect(
      buildPlaybackSearchQueries(
        {
          title: 'Seven - Clean Ver. (合作演出：Latto)',
          artists: ['정국 (Jung Kook)', 'Latto'],
          artist: '정국 (Jung Kook), Latto',
          duration: 184,
          sourcePlatform: 'yt-music',
          sourceType: 'track',
        },
        {
          title: 'Seven - Clean Ver. (合作演出：Latto)',
          artist: '정국 (Jung Kook) 和 Latto',
        },
      ),
    ).toEqual([
      '정국 Seven - Clean Ver.',
      'Seven - Clean Ver. 정국',
      'Latto Seven - Clean Ver.',
      'Seven - Clean Ver.',
    ]);
  });

  it('builds second-pass queries from close-duration cross-language candidates', () => {
    expect(
      buildPlaybackCrossSearchQueries(
        [
          {
            title: 'Parachute (feat. \u738b\u8b19Goatak)',
            artist: 'Sabrina \u80e1\u6062\u821e, \u738b\u8b19Goatak',
            duration: 210,
          },
          {
            title: 'Paper Plane',
            artist: 'Sabrina \u80e1\u6062\u821e',
            duration: 310,
          },
        ],
        { title: '\u964d\u843d\u5098', duration: 210 },
      ),
    ).toEqual([
      'Sabrina \u80e1\u6062\u821e, \u738b\u8b19Goatak Parachute',
      'Parachute Sabrina \u80e1\u6062\u821e, \u738b\u8b19Goatak',
    ]);
  });

  it('starts all metadata searches in parallel', async () => {
    const pending = [];
    const runner = vi.fn(() => {
      let resolve;
      const promise = new Promise((done) => {
        resolve = done;
      });
      pending.push(resolve);
      return promise;
    });

    const searchPromise = searchPlaybackCandidates(
      {
        title: 'Canonical Title',
        artist: 'Actual Artist',
      },
      { title: 'Actual Artist - Canonical Title (Official Music Video)' },
      { runner },
    );

    expect(runner).toHaveBeenCalledTimes(4);
    pending.forEach((resolve) => resolve({ entries: [] }));
    await expect(searchPromise).resolves.toEqual([]);
  });

  it('searches YouTube for a same-platform match without downloading media', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [
          {
            id: 'audio000001',
            title: 'Canonical Title (Official Audio)',
            uploader: 'Actual Artist',
            duration: 211,
          },
        ],
      })
      .mockResolvedValue({ entries: [] });

    await expect(
      searchPlaybackCandidates(
        {
          title: 'Canonical Title',
          artist: 'Actual Artist',
          duration: 211,
        },
        { title: 'Actual Artist - Canonical Title (Official Music Video)' },
        { runner },
      ),
    ).resolves.toEqual([
      {
        id: 'audio000001',
        playbackVideoId: 'audio000001',
        title: 'Canonical Title (Official Audio)',
        artist: 'Actual Artist',
        duration: 211,
        searchProvider: 'youtube',
        availableProviders: ['youtube'],
        reason: 'youtube-search',
        thumbnailUrl: 'https://i.ytimg.com/vi/audio000001/hqdefault.jpg',
      },
    ]);

    expect(runner).toHaveBeenCalledWith(
      'ytsearch5:Actual Artist Canonical Title',
      expect.objectContaining({
        dumpSingleJson: true,
        flatPlaylist: true,
        playlistEnd: 5,
        skipDownload: true,
      }),
    );
    expect(
      runner.mock.calls.some(([input]) =>
        String(input).startsWith('https://music.youtube.com'),
      ),
    ).toBe(false);
  });

  it('merges the same id found by two different YouTube search queries', async () => {
    const runner = vi.fn(async (input) => {
      if (input === 'ytsearch5:Actual Artist Canonical Title') {
        return {
          entries: [
            { id: 'nR-LSk3LfEA', title: 'Canonical Title', duration: 211 },
          ],
        };
      }
      if (input === 'ytsearch5:Canonical Title Actual Artist') {
        return {
          entries: [
            {
              id: 'nR-LSk3LfEA',
              title: 'Canonical Title',
              uploader: 'Actual Artist',
              duration: 211,
            },
          ],
        };
      }
      return { entries: [] };
    });

    await expect(
      searchPlaybackCandidates(
        { title: 'Canonical Title', artist: 'Actual Artist', duration: 211 },
        { title: 'Actual Artist - Canonical Title' },
        { runner },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        playbackVideoId: 'nR-LSk3LfEA',
        artist: 'Actual Artist',
        availableProviders: ['youtube'],
      }),
    ]);
  });

  it('keeps a Topic-channel result that only has an uploader, not an artist field', async () => {
    const runner = vi.fn().mockResolvedValueOnce({
      entries: [
        {
          id: 'nR-LSk3LfEA',
          title: 'Canonical Title',
          uploader: 'Actual Artist - Topic',
          duration: 211,
        },
      ],
    });

    const candidates = await searchPlaybackCandidates(
      { title: 'Canonical Title', artist: 'Actual Artist', duration: 211 },
      { title: 'Actual Artist - Canonical Title' },
      { runner },
    );

    expect(candidates.map((candidate) => candidate.playbackVideoId)).toEqual([
      'nR-LSk3LfEA',
    ]);
  });

  it('trusts a YT Music source completely and does not search', async () => {
    const runner = vi.fn().mockResolvedValue({ entries: [] });

    const candidates = await searchPlaybackCandidates(
      {
        title: 'Canonical Title',
        artist: 'Actual Artist',
      },
      { title: 'Actual Artist - Canonical Title' },
      { runner, sourcePlatform: 'yt-music' },
    );

    expect(candidates).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it('does not keep long video-like or live/medley-titled results as song candidates', async () => {
    const runner = vi.fn().mockResolvedValueOnce({
      entries: [
        {
          id: 'music000001',
          title: 'Canonical Title',
          uploader: 'Actual Artist',
          duration: 211,
        },
        {
          id: 'concert001',
          title:
            '2026.05.09 Sabrina胡恂舞 - 實踐大學 校園演唱會 / 全程【沒空想你】(4K)',
          uploader: 'Some Channel',
          duration: 1132,
        },
        {
          id: 'medley00001',
          title: '20260404胡恂舞Sabrina-台灣祭 全程 / BAD DAY / 降落傘',
          uploader: 'ddbbaii',
          duration: 2292,
        },
      ],
    });

    const candidates = await searchPlaybackCandidates(
      {
        title: 'Canonical Title',
        artist: 'Actual Artist',
        duration: 211,
      },
      { title: 'Actual Artist - Canonical Title' },
      { runner },
    );

    expect(candidates).toEqual([
      expect.objectContaining({ playbackVideoId: 'music000001' }),
    ]);
  });

  it('rejects title-only matches when the candidate artist is different', async () => {
    const runner = vi.fn().mockResolvedValueOnce({
      entries: [
        {
          id: 'music000001',
          title: 'Parachute',
          uploader: 'Sabrina Hu',
          duration: 211,
        },
        {
          id: 'wrongart001',
          title: 'Parachute (Cover)',
          uploader: 'Random Channel',
          duration: 211,
        },
      ],
    });

    const candidates = await searchPlaybackCandidates(
      {
        title: 'Parachute',
        artist: 'Sabrina Hu',
        duration: 211,
      },
      { title: 'Sabrina Hu - Parachute' },
      { runner },
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        playbackVideoId: 'music000001',
        artist: 'Sabrina Hu',
      }),
    ]);
  });

  it('keeps collaborations when the candidate artist contains the performer', async () => {
    const runner = vi.fn().mockResolvedValueOnce({
      entries: [
        {
          id: 'music000001',
          title: 'Parachute (feat. Goatak)',
          uploader: 'Sabrina Hu, Goatak',
          duration: 211,
        },
      ],
    });

    await expect(
      searchPlaybackCandidates(
        {
          title: 'Parachute',
          artist: 'Sabrina Hu, Goatak',
          duration: 211,
        },
        { title: 'Sabrina Hu - Parachute (feat. Goatak)' },
        { runner },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        playbackVideoId: 'music000001',
        artist: 'Sabrina Hu, Goatak',
      }),
    ]);
  });

  it('does not let channel-like source artists satisfy artist matching', async () => {
    const runner = vi.fn().mockResolvedValueOnce({
      entries: [
        {
          id: 'music000001',
          title: 'Parachute',
          uploader: 'Sabrina Hu',
          duration: 211,
        },
        {
          id: 'label000001',
          title: 'Parachute',
          uploader: 'Example Music',
          duration: 211,
        },
      ],
    });

    const candidates = await searchPlaybackCandidates(
      {
        title: 'Parachute',
        artist: 'Sabrina Hu',
        duration: 211,
      },
      {
        title: 'Sabrina Hu - Parachute (Official Music Video)',
        artist: 'Example Music',
      },
      { runner },
    );

    expect(candidates.map((candidate) => candidate.playbackVideoId)).toEqual([
      'music000001',
    ]);
  });

  it('keeps a label-channel upload whose title names the expected artist', async () => {
    const runner = vi.fn().mockResolvedValueOnce({
      entries: [
        {
          id: 'label000002',
          title: 'YOASOBI - \u591c\u306b\u99c6\u3051\u308b (Official Audio)',
          uploader: 'Sony Music Entertainment',
          duration: 261,
        },
      ],
    });

    const candidates = await searchPlaybackCandidates(
      {
        title: '\u591c\u306b\u99c6\u3051\u308b',
        artist: 'YOASOBI',
        duration: 261,
      },
      { title: 'YOASOBI - \u591c\u306b\u99c6\u3051\u308b' },
      { runner },
    );

    expect(candidates.map((candidate) => candidate.playbackVideoId)).toEqual([
      'label000002',
    ]);
  });

  it('uses close-duration results to bridge a second YouTube search', async () => {
    // Match on "Parachute" content, not an exact query string, so this
    // doesn't couple to buildPlaybackSearchQueries's internal ordering.
    const runner = vi.fn(async (input) => {
      if (input.includes('Parachute')) {
        return {
          entries: [
            {
              id: 'ytvideo0001',
              title: 'Sabrina \u80e1\u6062\u821e - \u964d\u843d\u5098',
              uploader: 'Sabrina \u80e1\u6062\u821e',
              duration: 210,
            },
          ],
        };
      }
      return {
        entries: [
          {
            id: 'music000001',
            title: 'Parachute (feat. \u738b\u8b19Goatak)',
            uploader: 'Sabrina \u80e1\u6062\u821e, \u738b\u8b19Goatak',
            duration: 210,
          },
        ],
      };
    });

    await expect(
      searchPlaybackCandidates(
        {
          title: '\u964d\u843d\u5098',
          artist: 'Sabrina \u80e1\u6062\u821e, \u738b\u8b19Goatak',
          duration: 210,
        },
        { title: '\u964d\u843d\u5098' },
        { runner },
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playbackVideoId: 'music000001',
          title: 'Parachute (feat. \u738b\u8b19Goatak)',
        }),
      ]),
    );
  });

  it('deduplicates repeated search results and ignores invalid ids', async () => {
    const runner = vi.fn().mockResolvedValue({
      entries: [
        { id: 'same0000001', title: 'Song' },
        { id: 'same0000001', title: 'Song duplicate' },
        { id: 'too-short', title: 'Invalid' },
      ],
    });

    await expect(
      searchPlaybackCandidates({ title: 'Song' }, {}, { runner }),
    ).resolves.toHaveLength(1);
  });
});
