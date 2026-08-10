import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applySubtitleOptions,
  applyYoutubeRuntimeOptions,
  buildAudioDownloadOptionAttempts,
  buildSubtitleOptions,
  extractMetadataFields,
  finalizeDownloadedTrackFiles,
  isForbiddenAudioDownloadError,
  readTrackInfoMetadata,
  readTrackSidecarState,
  runYoutubeDownloadAttempts,
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
      version: 6,
      sources: [],
    });
  });

  it('throws when yt-dlp produced no structured audio file', () => {
    expect(() => finalizeDownloadedTrackFiles(dir)).toThrow(
      'yt-dlp reported success but no audio output file found',
    );
  });
});
