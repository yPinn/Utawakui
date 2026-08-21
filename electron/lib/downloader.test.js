import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applySubtitleOptions,
  buildAudioDownloadOptionAttempts,
  buildSubtitleOptions,
  fetchPlaylist,
  finalizeDownloadedTrackFiles,
  hasStructuredAudioFile,
  isMissingAudioOutputError,
  readTrackInfoMetadata,
  readTrackSidecarState,
} from './downloader.js';

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
  const originalPoToken = process.env.UTAWAKUI_YTDLP_PO_TOKEN;
  const originalVisitorData = process.env.UTAWAKUI_YTDLP_VISITOR_DATA;

  afterEach(() => {
    if (originalPoToken === undefined) {
      delete process.env.UTAWAKUI_YTDLP_PO_TOKEN;
    } else {
      process.env.UTAWAKUI_YTDLP_PO_TOKEN = originalPoToken;
    }
    if (originalVisitorData === undefined) {
      delete process.env.UTAWAKUI_YTDLP_VISITOR_DATA;
    } else {
      process.env.UTAWAKUI_YTDLP_VISITOR_DATA = originalVisitorData;
    }
  });

  it('builds default and progressively stronger YouTube 403 fallback attempts (client rotation, cookies, impersonate)', () => {
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
        extractorArgs: 'youtube:player_js_version=actual',
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
          'youtube:player_client=tv_simply;player_js_version=actual',
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
          'youtube:player_client=web_safari;player_js_version=actual',
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
        extractorArgs: 'youtube:player_client=mweb;player_js_version=actual',
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
        extractorArgs: 'youtube:player_js_version=actual',
        cookiesFromBrowser: 'chrome',
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
        extractorArgs: 'youtube:player_js_version=actual',
        cookiesFromBrowser: 'edge',
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
        extractorArgs: 'youtube:player_js_version=actual',
        cookiesFromBrowser: 'firefox',
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
        extractorArgs: 'youtube:player_js_version=actual',
        impersonate: 'chrome',
      },
    ]);
  });

  it('includes a manual PO-token attempt when the local runtime env provides one', () => {
    process.env.UTAWAKUI_YTDLP_PO_TOKEN = 'TOKEN_VALUE';
    process.env.UTAWAKUI_YTDLP_VISITOR_DATA = 'VISITOR_DATA';

    const attempts = buildAudioDownloadOptionAttempts({
      output: 'audio.%(ext)s',
      noPlaylist: true,
      writeInfoJson: true,
    });

    expect(attempts).toContainEqual(
      expect.objectContaining({
        extractorArgs:
          'youtube:player_client=mweb;po_token=mweb.gvs+TOKEN_VALUE;visitor_data=VISITOR_DATA;player_js_version=actual',
      }),
    );
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

  it("captures the playlist/album's own artwork, not any entry's", async () => {
    const runner = vi.fn().mockResolvedValue({
      title: 'GOLDEN',
      thumbnail: 'https://i.ytimg.com/vi/playlist-art/hqdefault.jpg',
      entries: [],
    });

    const result = await fetchPlaylist('playlist123', { runner });

    expect(result.thumbnailUrl).toBe(
      'https://i.ytimg.com/vi/playlist-art/hqdefault.jpg',
    );
  });

  it('is undefined when the playlist info has no thumbnail data', async () => {
    const runner = vi.fn().mockResolvedValue({ title: 'GOLDEN', entries: [] });

    const result = await fetchPlaylist('playlist123', { runner });

    expect(result.thumbnailUrl).toBeUndefined();
  });

  it("uses the first track's album metadata for YT Music album playlist names", async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        title: 'Album - 163braces',
        entries: [
          {
            id: 'qog79Ke0IvQ',
            title: '門縫後的光',
            uploader: '163braces - Topic',
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'qog79Ke0IvQ',
        title: '門縫後的光',
        artist: '163braces',
        album: '海螺記',
      });

    await expect(
      fetchPlaylist('OLAK5uy_nBWL9lmnXFFbywEUiSJAHvuCyoA62FZAo', { runner }),
    ).resolves.toMatchObject({
      title: '海螺記',
      entries: [
        expect.objectContaining({
          id: 'qog79Ke0IvQ',
          title: '門縫後的光',
        }),
      ],
    });

    expect(runner).toHaveBeenNthCalledWith(
      2,
      'https://www.youtube.com/watch?v=qog79Ke0IvQ',
      expect.objectContaining({
        dumpSingleJson: true,
        noPlaylist: true,
        skipDownload: true,
      }),
    );
  });

  it('keeps the playlist-level title when YT Music album metadata is unavailable', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce({
        title: 'Album - Unknown Artist',
        entries: [{ id: 'qog79Ke0IvQ', title: 'Song' }],
      })
      .mockResolvedValueOnce({
        id: 'qog79Ke0IvQ',
        title: 'Song',
      });

    await expect(
      fetchPlaylist('OLAK5uy_nBWL9lmnXFFbywEUiSJAHvuCyoA62FZAo', { runner }),
    ).resolves.toMatchObject({
      title: 'Album - Unknown Artist',
    });
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

describe('hasStructuredAudioFile', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-download-test-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is false when the directory has no structured audio file', () => {
    expect(hasStructuredAudioFile(dir)).toBe(false);
  });

  it('is false for a non-audio extension yt-dlp might leave behind (e.g. HLS-only output)', () => {
    fs.writeFileSync(path.join(dir, 'audio.ts'), 'segment');
    expect(hasStructuredAudioFile(dir)).toBe(false);
  });

  it('is true once a recognized structured audio file exists', () => {
    fs.writeFileSync(path.join(dir, 'audio.m4a'), 'audio');
    expect(hasStructuredAudioFile(dir)).toBe(true);
  });
});

describe('isMissingAudioOutputError', () => {
  it('matches the exact message finalizeDownloadedTrackFiles throws', () => {
    expect(
      isMissingAudioOutputError(
        new Error('yt-dlp reported success but no audio output file found'),
      ),
    ).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isMissingAudioOutputError(new Error('HTTP Error 403'))).toBe(false);
    expect(isMissingAudioOutputError(undefined)).toBe(false);
  });
});
