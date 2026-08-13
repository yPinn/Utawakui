import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applySubtitleOptions,
  applyYoutubeRuntimeOptions,
  buildAudioDownloadOptionAttempts,
  buildPlaybackCrossSearchQueries,
  buildPlaybackSearchQueries,
  buildSubtitleOptions,
  extractMetadataFields,
  fetchPlaylist,
  finalizeDownloadedTrackFiles,
  isForbiddenAudioDownloadError,
  readTrackInfoMetadata,
  readTrackSidecarState,
  runYoutubeDownloadAttempts,
  searchPlaybackCandidates,
} from './downloader.js';

// downloadAudio/fetchMetadata themselves call the real yt-dlp/YouTube —
// deliberately not covered here (slow, network-dependent, not suitable for
// CI). extractMetadataFields is the pure field-extraction logic they share.
describe('extractMetadataFields', () => {
  it('extracts a full YT Music info object', () => {
    expect(
      extractMetadataFields({
        title: '夜に駆ける',
        artist: 'YOASOBI',
        uploader: 'YOASOBI Official Channel',
        duration: 261,
      }),
    ).toEqual({ title: '夜に駆ける', artist: 'YOASOBI', duration: 261 });
  });

  it('falls back to uploader for artist on a plain YouTube upload', () => {
    expect(
      extractMetadataFields({
        title: 'Some Video',
        uploader: 'Some Channel',
        duration: 120.5,
      }),
    ).toEqual({ title: 'Some Video', artist: 'Some Channel', duration: 120.5 });
  });

  it('leaves artist undefined when neither artist nor uploader is present', () => {
    expect(extractMetadataFields({ title: 'Untitled', duration: 10 })).toEqual({
      title: 'Untitled',
      artist: undefined,
      duration: 10,
    });
  });

  it('leaves everything undefined for an empty info object', () => {
    expect(extractMetadataFields({})).toEqual({
      title: undefined,
      artist: undefined,
      duration: undefined,
    });
  });

  it('ignores wrong-typed fields instead of coercing them', () => {
    expect(
      extractMetadataFields({ title: 123, artist: null, duration: '261' }),
    ).toEqual({ title: undefined, artist: undefined, duration: undefined });
  });

  it('extracts a direct HTTPS thumbnail URL for preview-only rendering', () => {
    expect(
      extractMetadataFields({
        title: 'Preview Song',
        thumbnail: 'https://i.ytimg.com/vi/id/hqdefault.jpg',
      }).thumbnailUrl,
    ).toBe('https://i.ytimg.com/vi/id/hqdefault.jpg');
  });

  it('uses the largest thumbnail array entry when no direct thumbnail exists', () => {
    expect(
      extractMetadataFields({
        thumbnails: [
          { url: 'https://i.ytimg.com/vi/id/default.jpg' },
          { url: 'https://i.ytimg.com/vi/id/maxresdefault.jpg' },
        ],
      }).thumbnailUrl,
    ).toBe('https://i.ytimg.com/vi/id/maxresdefault.jpg');
  });

  it('falls back to the standard YouTube thumbnail URL for video ids', () => {
    expect(
      extractMetadataFields({
        id: '0D28qd--kRE',
      }).thumbnailUrl,
    ).toBe('https://i.ytimg.com/vi/0D28qd--kRE/hqdefault.jpg');
  });

  it('ignores non-HTTPS thumbnail URLs', () => {
    expect(
      extractMetadataFields({
        thumbnail: 'file:///C:/secret.jpg',
        thumbnails: [{ url: 'http://example.test/insecure.jpg' }],
      }).thumbnailUrl,
    ).toBeUndefined();
  });

  it('extracts album and releaseYear for a recognized-music source', () => {
    const fields = extractMetadataFields({
      title: 'Track Name',
      artist: 'Some Artist',
      album: 'Some Album',
      release_year: 2018,
    });
    expect(fields.album).toBe('Some Album');
    expect(fields.releaseYear).toBe(2018);
  });

  it('omits album and releaseYear rather than defaulting when absent', () => {
    const fields = extractMetadataFields({
      title: 'Plain Upload',
      uploader: 'Some Channel',
    });
    expect(fields.album).toBeUndefined();
    expect(fields.releaseYear).toBeUndefined();
  });

  it('ignores wrong-typed album/release_year instead of coercing them', () => {
    const fields = extractMetadataFields({
      title: 'Track Name',
      album: 123,
      release_year: '2018',
    });
    expect(fields.album).toBeUndefined();
    expect(fields.releaseYear).toBeUndefined();
  });
});

describe('applyYoutubeRuntimeOptions', () => {
  it('adds the yt-dlp JavaScript runtime required for YouTube extraction', () => {
    expect(applyYoutubeRuntimeOptions({ format: 'bestaudio' })).toEqual({
      format: 'bestaudio',
      jsRuntimes: 'node',
    });
  });

  it('lets a caller-provided runtime override the default', () => {
    expect(
      applyYoutubeRuntimeOptions({ jsRuntimes: 'deno:C:\\Tools\\deno.exe' }),
    ).toEqual({ jsRuntimes: 'deno:C:\\Tools\\deno.exe' });
  });
});

describe('applySubtitleOptions', () => {
  it('does not fall back to automatic captions', () => {
    expect(applySubtitleOptions({ skipDownload: true })).toEqual({
      skipDownload: true,
      writeSubs: false,
      writeAutoSubs: false,
      subFormat: 'vtt',
    });
  });

  it('lets callers override subtitle language preferences', () => {
    expect(applySubtitleOptions({ subLangs: 'all,-live_chat' })).toMatchObject({
      subLangs: 'all,-live_chat',
    });
  });
});

describe('buildAudioDownloadOptionAttempts', () => {
  it('builds a default attempt and a YouTube 403 fallback attempt', () => {
    expect(
      buildAudioDownloadOptionAttempts(
        {
          output: 'audio.%(ext)s',
          noPlaylist: true,
          writeInfoJson: true,
        },
        {
          title: 'あたらよ',
          subtitles: { ja: [{ ext: 'vtt' }] },
        },
      ),
    ).toEqual([
      {
        jsRuntimes: 'node',
        writeSubs: true,
        writeAutoSubs: false,
        subLangs: 'ja',
        subFormat: 'vtt',
        output: 'audio.%(ext)s',
        noPlaylist: true,
        writeInfoJson: true,
        format: 'bestaudio/best',
      },
      {
        jsRuntimes: 'node',
        writeSubs: true,
        writeAutoSubs: false,
        subLangs: 'ja',
        subFormat: 'vtt',
        output: 'audio.%(ext)s',
        noPlaylist: true,
        writeInfoJson: true,
        format: 'bestaudio[ext=m4a]/bestaudio/best',
        extractorArgs:
          'youtube:player_client=default,-android_vr,-android_sdkless;player_js_version=actual',
      },
    ]);
  });
});

describe('runYoutubeDownloadAttempts', () => {
  it('retries with the next attempt when YouTube returns audio-data 403', async () => {
    const forbidden = Object.assign(
      new Error(
        'ERROR: unable to download video data: HTTP Error 403: Forbidden',
      ),
      {
        stderr:
          'ERROR: unable to download video data: HTTP Error 403: Forbidden',
      },
    );
    const runner = vi
      .fn()
      .mockRejectedValueOnce(forbidden)
      .mockResolvedValueOnce('ok');

    await expect(
      runYoutubeDownloadAttempts(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        [{ format: 'bestaudio/best' }, { format: 'bestaudio[ext=m4a]' }],
        runner,
      ),
    ).resolves.toBe('ok');

    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner).toHaveBeenLastCalledWith(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { format: 'bestaudio[ext=m4a]' },
    );
  });

  it('does not retry unrelated yt-dlp failures', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('Private video'));

    await expect(
      runYoutubeDownloadAttempts(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        [{ format: 'bestaudio/best' }, { format: 'bestaudio[ext=m4a]' }],
        runner,
      ),
    ).rejects.toThrow('Private video');

    expect(runner).toHaveBeenCalledTimes(1);
  });
});

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

    expect(runner).toHaveBeenCalledTimes(8);
    pending.forEach((resolve) => resolve({ entries: [] }));
    await expect(searchPromise).resolves.toEqual([]);
  });

  it('searches YouTube Music and YouTube without downloading media', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [
          {
            id: 'music000001',
            title: 'Canonical Title',
            artist: 'Actual Artist',
            duration: 211,
          },
        ],
      })
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
        id: 'music000001',
        playbackVideoId: 'music000001',
        title: 'Canonical Title',
        artist: 'Actual Artist',
        duration: 211,
        playbackKind: 'yt-music-song',
        searchProvider: 'yt-music',
        availableProviders: ['yt-music'],
        reason: 'yt-music-search',
        thumbnailUrl: 'https://i.ytimg.com/vi/music000001/hqdefault.jpg',
      },
      {
        id: 'audio000001',
        playbackVideoId: 'audio000001',
        title: 'Canonical Title (Official Audio)',
        artist: 'Actual Artist',
        duration: 211,
        playbackKind: undefined,
        searchProvider: 'youtube',
        availableProviders: ['youtube'],
        reason: 'youtube-search',
        thumbnailUrl: 'https://i.ytimg.com/vi/audio000001/hqdefault.jpg',
      },
    ]);

    expect(runner).toHaveBeenCalledWith(
      'https://music.youtube.com/search?q=Actual+Artist+Canonical+Title#songs',
      expect.objectContaining({
        dumpSingleJson: true,
        flatPlaylist: true,
        playlistEnd: 5,
        skipDownload: true,
      }),
    );
    expect(runner).toHaveBeenCalledWith(
      'ytsearch5:Actual Artist Canonical Title',
      expect.objectContaining({
        dumpSingleJson: true,
        flatPlaylist: true,
        playlistEnd: 5,
        skipDownload: true,
      }),
    );
  });

  it('merges same-id YouTube Music and YouTube search results as a YT Music-capable audio candidate', async () => {
    const runner = vi.fn(async (input) => {
      if (input.startsWith('https://music.youtube.com/search')) {
        return {
          entries: [
            {
              id: 'nR-LSk3LfEA',
              title: '紙飛機',
              duration: 250,
              resultType: 'song',
            },
          ],
        };
      }
      if (input.startsWith('ytsearch5:')) {
        return {
          entries: [
            {
              id: 'nR-LSk3LfEA',
              title: '紙飛機',
              uploader: 'Goatak · Sabrina - Topic',
              duration: 250,
            },
          ],
        };
      }
      return { entries: [] };
    });

    await expect(
      searchPlaybackCandidates(
        {
          title: '降落傘',
          artists: ['Sabrina 胡恂舞', '王謙Goatak'],
          duration: 250,
        },
        {
          title: 'Sabrina 胡恂舞, 王謙Goatak - 降落傘',
        },
        { runner, sourcePlatform: 'youtube' },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        playbackVideoId: 'nR-LSk3LfEA',
        searchProvider: 'yt-music',
        availableProviders: ['yt-music', 'youtube'],
        playbackKind: 'yt-music-song',
      }),
    ]);
  });

  it('keeps YT Music search limited to song results and leaves videos to YouTube search', async () => {
    const runner = vi.fn(async (input) => {
      if (input.startsWith('https://music.youtube.com/search')) {
        return {
          entries: [
            {
              id: 'music000001',
              title: 'Canonical Title',
              artist: 'Actual Artist',
              duration: 211,
              resultType: 'song',
            },
            {
              id: 'musicvideo1',
              title: 'Canonical Title (Official Music Video)',
              artist: 'Actual Artist',
              duration: 240,
              resultType: 'video',
            },
            {
              id: 'musicvideo2',
              title: 'Canonical Title Official MV',
              artist: 'Actual Artist',
              duration: 240,
            },
          ],
        };
      }
      if (input.startsWith('ytsearch5:')) {
        return {
          entries: [
            {
              id: 'ytvideo0001',
              title: 'Canonical Title (Official Music Video)',
              uploader: 'Actual Artist',
              duration: 240,
            },
          ],
        };
      }
      return { entries: [] };
    });

    const candidates = await searchPlaybackCandidates(
      {
        title: 'Canonical Title',
        artist: 'Actual Artist',
        duration: 211,
      },
      { title: 'Actual Artist - Canonical Title (Official Music Video)' },
      { runner },
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playbackVideoId: 'music000001',
          playbackKind: 'yt-music-song',
          searchProvider: 'yt-music',
        }),
        expect.objectContaining({
          playbackVideoId: 'ytvideo0001',
          playbackKind: undefined,
          searchProvider: 'youtube',
        }),
      ]),
    );
    expect(
      candidates.map((candidate) => candidate.playbackVideoId),
    ).not.toEqual(expect.arrayContaining(['musicvideo1', 'musicvideo2']));
  });

  it('uses only YT Music song search for YT Music input sources', async () => {
    const runner = vi.fn().mockResolvedValue({ entries: [] });

    await searchPlaybackCandidates(
      {
        title: 'Canonical Title',
        artist: 'Actual Artist',
      },
      { title: 'Actual Artist - Canonical Title' },
      { runner, sourcePlatform: 'yt-music' },
    );

    expect(runner).toHaveBeenCalledTimes(4);
    expect(runner.mock.calls.every(([input]) => input.includes('#songs'))).toBe(
      true,
    );
    expect(
      runner.mock.calls.some(([input]) => String(input).startsWith('ytsearch')),
    ).toBe(false);
  });

  it('does not keep long video-like YT Music results as song candidates', async () => {
    const runner = vi.fn(async (input) => {
      if (input.startsWith('https://music.youtube.com/search')) {
        return {
          entries: [
            {
              id: 'music000001',
              title: 'Canonical Title',
              artist: 'Actual Artist',
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
        };
      }
      return { entries: [] };
    });

    const candidates = await searchPlaybackCandidates(
      {
        title: 'Canonical Title',
        artist: 'Actual Artist',
        duration: 211,
      },
      { title: 'Actual Artist - Canonical Title' },
      { runner, sourcePlatform: 'yt-music' },
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        playbackVideoId: 'music000001',
        playbackKind: 'yt-music-song',
      }),
    ]);
  });

  it('rejects YT Music title-only matches when the candidate artist is different', async () => {
    const runner = vi.fn(async (input) => {
      if (input.startsWith('https://music.youtube.com/search')) {
        return {
          entries: [
            {
              id: 'music000001',
              title: 'Parachute',
              artist: 'Sabrina Hu',
              duration: 211,
              resultType: 'song',
            },
            {
              id: 'wrongart001',
              title: 'Sabrina Hu - Parachute campus singalong',
              artist: 'Other Channel',
              duration: 211,
              resultType: 'song',
            },
          ],
        };
      }
      return { entries: [] };
    });

    const candidates = await searchPlaybackCandidates(
      {
        title: 'Parachute',
        artist: 'Sabrina Hu',
        duration: 211,
      },
      { title: 'Sabrina Hu - Parachute' },
      { runner, sourcePlatform: 'yt-music' },
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        playbackVideoId: 'music000001',
        artist: 'Sabrina Hu',
      }),
    ]);
  });

  it('keeps YT Music collaborations when the candidate artist contains the performer', async () => {
    const runner = vi.fn(async (input) => {
      if (input.startsWith('https://music.youtube.com/search')) {
        return {
          entries: [
            {
              id: 'music000001',
              title: 'Parachute (feat. Goatak)',
              artist: 'Sabrina Hu, Goatak',
              duration: 211,
              resultType: 'song',
            },
          ],
        };
      }
      return { entries: [] };
    });

    await expect(
      searchPlaybackCandidates(
        {
          title: 'Parachute',
          artist: 'Sabrina Hu, Goatak',
          duration: 211,
        },
        { title: 'Sabrina Hu - Parachute (feat. Goatak)' },
        { runner, sourcePlatform: 'yt-music' },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        playbackVideoId: 'music000001',
        artist: 'Sabrina Hu, Goatak',
      }),
    ]);
  });

  it('does not let channel-like source artists satisfy YT Music artist matching', async () => {
    const runner = vi.fn(async (input) => {
      if (input.startsWith('https://music.youtube.com/search')) {
        return {
          entries: [
            {
              id: 'music000001',
              title: 'Parachute',
              artist: 'Sabrina Hu',
              duration: 211,
              resultType: 'song',
            },
            {
              id: 'label000001',
              title: 'Parachute',
              artist: 'Example Music',
              duration: 211,
              resultType: 'song',
            },
          ],
        };
      }
      return { entries: [] };
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
      { runner, sourcePlatform: 'yt-music' },
    );

    expect(candidates.map((candidate) => candidate.playbackVideoId)).toEqual([
      'music000001',
    ]);
  });

  it('uses close-duration music results to bridge a second YouTube search', async () => {
    const runner = vi.fn(async (input) => {
      if (
        input.startsWith('https://music.youtube.com/search') &&
        input.includes('%E9%99%8D%E8%90%BD%E5%82%98')
      ) {
        return {
          entries: [
            {
              id: 'music000001',
              title: 'Parachute (feat. \u738b\u8b19Goatak)',
              artist: 'Sabrina \u80e1\u6062\u821e, \u738b\u8b19Goatak',
              duration: 210,
            },
          ],
        };
      }
      if (
        input ===
        'ytsearch5:Sabrina \u80e1\u6062\u821e, \u738b\u8b19Goatak Parachute'
      ) {
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
      return { entries: [] };
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
          searchProvider: 'yt-music',
          title: 'Parachute (feat. \u738b\u8b19Goatak)',
        }),
        expect.objectContaining({
          playbackVideoId: 'ytvideo0001',
          searchProvider: 'youtube',
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

describe('fetchPlaylist', () => {
  it('keeps playlist entries fast while attaching track identity metadata', async () => {
    const runner = vi.fn().mockResolvedValue({
      title: 'Karaoke Favorites',
      entries: [
        {
          id: 'mv123456789',
          title: 'Sabrina Hu - Parachute (Official Music Video)',
          uploader: 'Example Music',
          duration: 240,
        },
      ],
    });

    await expect(fetchPlaylist('playlist123', { runner })).resolves.toEqual({
      title: 'Karaoke Favorites',
      entries: [
        expect.objectContaining({
          id: 'mv123456789',
          title: 'Sabrina Hu - Parachute (Official Music Video)',
          artist: 'Example Music',
          duration: 240,
          trackIdentity: expect.objectContaining({
            title: 'Parachute',
            artists: ['Sabrina Hu'],
            sourcePlatform: 'youtube',
            sourceType: 'playlist-entry',
            sourceId: 'mv123456789',
          }),
        }),
      ],
    });
    expect(runner).toHaveBeenCalledWith(
      'https://www.youtube.com/playlist?list=playlist123',
      expect.objectContaining({
        flatPlaylist: true,
        dumpSingleJson: true,
      }),
    );
  });
});

describe('isForbiddenAudioDownloadError', () => {
  it('detects yt-dlp HTTP 403 video-data download failures', () => {
    expect(
      isForbiddenAudioDownloadError({
        stderr:
          'ERROR: unable to download video data: HTTP Error 403: Forbidden',
      }),
    ).toBe(true);
  });

  it('ignores other 403 failures', () => {
    expect(
      isForbiddenAudioDownloadError({
        stderr: 'ERROR: HTTP Error 403: Forbidden',
      }),
    ).toBe(false);
  });
});

describe('buildSubtitleOptions', () => {
  it('prefers matching manual subtitles for Chinese songs', () => {
    expect(
      buildSubtitleOptions({
        title: '沒空想你 Official Music Video',
        artist: 'Sabrina 胡恂舞',
        subtitles: {
          ja: [{ ext: 'vtt' }],
          'zh-Hant': [{ ext: 'vtt' }],
          en: [{ ext: 'vtt' }],
        },
        automatic_captions: {
          'zh-Hant-orig': [{ ext: 'vtt' }],
        },
      }),
    ).toEqual({
      writeSubs: true,
      writeAutoSubs: false,
      subLangs: 'zh-Hant',
      subFormat: 'vtt',
    });
  });

  it('does not use automatic captions when manual subtitles are likely translations', () => {
    expect(
      buildSubtitleOptions({
        title: '沒空想你 Official Music Video',
        subtitles: {
          ja: [{ ext: 'vtt' }],
          en: [{ ext: 'vtt' }],
        },
        automatic_captions: {
          'zh-Hant-orig': [{ ext: 'vtt' }],
          en: [{ ext: 'vtt' }],
          ja: [{ ext: 'vtt' }],
        },
      }),
    ).toEqual({
      writeSubs: false,
      writeAutoSubs: false,
      subFormat: 'vtt',
    });
  });

  it('accepts a single manual subtitle when there are no competing translations', () => {
    expect(
      buildSubtitleOptions({
        title: 'Track 01',
        subtitles: {
          en: [{ ext: 'vtt' }],
        },
        automatic_captions: {},
      }),
    ).toEqual({
      writeSubs: true,
      writeAutoSubs: false,
      subLangs: 'en',
      subFormat: 'vtt',
    });
  });

  it('prefers zh-TW over other Chinese subtitle variants for Chinese songs', () => {
    expect(
      buildSubtitleOptions({
        title:
          '\u4f60\u5230\u5e95\u5728\u9078\u64c7\u4ec0\u9ebc Official Music Video',
        subtitles: {
          'zh-Hans': [{ ext: 'vtt' }],
          'zh-Hant': [{ ext: 'vtt' }],
          'zh-TW': [{ ext: 'vtt' }],
        },
        automatic_captions: {},
      }),
    ).toEqual({
      writeSubs: true,
      writeAutoSubs: false,
      subLangs: 'zh-TW',
      subFormat: 'vtt',
    });
  });

  it('uses the first available manual subtitle as the default when language is unknown', () => {
    expect(
      buildSubtitleOptions({
        title: '12345',
        subtitles: {
          ja: [{ ext: 'vtt' }],
          en: [{ ext: 'vtt' }],
        },
        automatic_captions: {},
      }),
    ).toEqual({
      writeSubs: true,
      writeAutoSubs: false,
      subLangs: 'ja',
      subFormat: 'vtt',
    });
  });

  it('does not treat an unmatched single manual subtitle as lyrics when track language is known', () => {
    expect(
      buildSubtitleOptions({
        title: '沒空想你',
        subtitles: {
          en: [{ ext: 'vtt' }],
        },
        automatic_captions: {},
      }),
    ).toEqual({
      writeSubs: false,
      writeAutoSubs: false,
      subFormat: 'vtt',
    });
  });

  it('rejects translated caption tags that start with the preferred language', () => {
    expect(
      buildSubtitleOptions({
        title: '你到底在選擇什麼 Official Music Video',
        subtitles: {},
        automatic_captions: {
          'ja-zh-TW': [{ ext: 'vtt' }],
        },
      }),
    ).toEqual({
      writeSubs: false,
      writeAutoSubs: false,
      subFormat: 'vtt',
    });
  });

  it('ignores original automatic captions and translated variants', () => {
    expect(
      buildSubtitleOptions({
        title: '天使借的溫柔 Angel’s Touch',
        subtitles: {},
        automatic_captions: {
          'zh-Hant-orig': [{ ext: 'vtt' }],
          'zh-Hant-ja': [{ ext: 'vtt' }],
        },
      }),
    ).toEqual({
      writeSubs: false,
      writeAutoSubs: false,
      subFormat: 'vtt',
    });
  });
});

describe('finalizeDownloadedTrackFiles', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-download-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps structured audio and normalizes info/artwork sidecars', () => {
    fs.writeFileSync(path.join(dir, 'audio.webm'), 'audio');
    fs.writeFileSync(path.join(dir, 'audio.info.json'), '{"title":"Song"}');
    fs.writeFileSync(path.join(dir, 'audio.jpg'), 'image');

    expect(finalizeDownloadedTrackFiles(dir)).toEqual({
      audioFilename: 'audio.webm',
      infoFilename: 'info.json',
      thumbnailFilename: 'thumbnail.jpg',
    });
    expect(fs.existsSync(path.join(dir, 'info.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'thumbnail.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'audio.info.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'audio.jpg'))).toBe(false);
  });

  it('normalizes sidecars and reads metadata for an existing structured track backfill', () => {
    fs.writeFileSync(path.join(dir, 'audio.mp3'), 'audio');
    fs.writeFileSync(
      path.join(dir, 'audio.info.json'),
      JSON.stringify({
        title: 'Never Gonna Give You Up',
        uploader: 'Rick Astley',
        duration: 213,
      }),
    );
    fs.writeFileSync(path.join(dir, 'audio.webp'), 'image');

    expect(finalizeDownloadedTrackFiles(dir)).toEqual({
      audioFilename: 'audio.mp3',
      infoFilename: 'info.json',
      thumbnailFilename: 'thumbnail.webp',
    });
    expect(readTrackInfoMetadata(dir)).toEqual({
      title: 'Never Gonna Give You Up',
      artist: 'Rick Astley',
      duration: 213,
    });
    expect(fs.existsSync(path.join(dir, 'audio.mp3'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'thumbnail.webp'))).toBe(true);
    expect(readTrackSidecarState(dir)).toMatchObject({
      hasInfo: true,
      thumbnailFilename: 'thumbnail.webp',
      lyricsState: '',
    });
  });

  it('normalizes yt-dlp VTT subtitles and records lyrics as checked', () => {
    fs.writeFileSync(path.join(dir, 'audio.mp3'), 'audio');
    fs.writeFileSync(path.join(dir, 'audio.ja.vtt'), 'WEBVTT');

    expect(finalizeDownloadedTrackFiles(dir)).toEqual({
      audioFilename: 'audio.mp3',
      infoFilename: undefined,
      thumbnailFilename: undefined,
    });
    expect(fs.existsSync(path.join(dir, 'lyrics', 'ja.vtt'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'audio.ja.vtt'))).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, 'lyrics', 'lyrics.json'))),
    ).toMatchObject({
      checked: true,
      sources: [{ filename: 'ja.vtt', language: 'ja', kind: 'youtube-cc' }],
    });
    expect(readTrackSidecarState(dir)).toMatchObject({
      lyricsState: 'ja.vtt',
    });
  });

  it('records lyrics as checked when yt-dlp finds no matching subtitles', () => {
    fs.writeFileSync(path.join(dir, 'audio.mp3'), 'audio');

    finalizeDownloadedTrackFiles(dir);

    const manifest = fs.readFileSync(
      path.join(dir, 'lyrics', 'lyrics.json'),
      'utf8',
    );
    expect(JSON.parse(manifest)).toMatchObject({ checked: true, sources: [] });
    expect(readTrackSidecarState(dir)).toMatchObject({
      lyricsManifestState: manifest,
    });
  });

  it('clears old lyrics sources when rescanning a stale manifest', () => {
    const lyricsDir = path.join(dir, 'lyrics');
    fs.mkdirSync(lyricsDir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'audio.mp3'), 'audio');
    fs.writeFileSync(path.join(dir, 'audio.zh-Hant-orig.vtt'), 'WEBVTT');
    fs.writeFileSync(path.join(lyricsDir, 'ja.vtt'), 'translated');
    fs.writeFileSync(path.join(lyricsDir, 'lyrics.json'), '{"version":2}');

    finalizeDownloadedTrackFiles(dir, { resetLyrics: true });

    expect(fs.existsSync(path.join(lyricsDir, 'ja.vtt'))).toBe(false);
    expect(fs.existsSync(path.join(lyricsDir, 'zh-Hant-orig.vtt'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'audio.zh-Hant-orig.vtt'))).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(lyricsDir, 'lyrics.json'))),
    ).toMatchObject({
      version: 8,
      sources: [],
    });
  });

  it('throws when yt-dlp produced no structured audio file', () => {
    expect(() => finalizeDownloadedTrackFiles(dir)).toThrow(
      'yt-dlp reported success but no audio output file found',
    );
  });
});
