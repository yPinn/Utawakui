import { describe, expect, it, vi } from 'vitest';
import {
  buildMatcherSubtitleParams,
  buildMusixmatchUrl,
  MUSIXMATCH_API_KEY_ENV,
  parseLrcLines,
  probeMusixmatchLyrics,
  summarizeMusixmatchPayload,
} from './musixmatch.js';

describe('buildMatcherSubtitleParams', () => {
  it('builds matcher.subtitle.get params from track metadata', () => {
    expect(
      buildMatcherSubtitleParams({
        title: 'Never Gonna Give You Up',
        artist: 'Rick Astley',
        duration: 213.2,
      }),
    ).toEqual({
      q_track: 'Never Gonna Give You Up',
      q_artist: 'Rick Astley',
      subtitle_format: 'lrc',
      f_subtitle_length: 213,
      f_subtitle_length_max_deviation: 3,
    });
  });

  it('omits invalid duration filters', () => {
    expect(
      buildMatcherSubtitleParams({
        title: 'Track',
        artist: 'Artist',
        duration: undefined,
      }),
    ).toEqual({
      q_track: 'Track',
      q_artist: 'Artist',
      subtitle_format: 'lrc',
    });
  });
});

describe('buildMusixmatchUrl', () => {
  it('adds the API key query parameter without mutating params', () => {
    const params = { q_track: 'Song', empty: '' };
    const url = buildMusixmatchUrl(
      'matcher.subtitle.get',
      params,
      'secret-key',
      'https://api.example.test/ws/1.1/',
    );

    expect(url.toString()).toBe(
      'https://api.example.test/ws/1.1/matcher.subtitle.get?q_track=Song&apikey=secret-key',
    );
    expect(params).toEqual({ q_track: 'Song', empty: '' });
  });
});

describe('parseLrcLines', () => {
  it('parses timestamped LRC lines and ignores metadata lines', () => {
    expect(
      parseLrcLines(`[ar:Artist]
[00:01.50]First line
[00:03.000][00:05.000]Repeated line`),
    ).toEqual([
      { start: 1.5, text: 'First line' },
      { start: 3, text: 'Repeated line' },
      { start: 5, text: 'Repeated line' },
    ]);
  });
});

describe('summarizeMusixmatchPayload', () => {
  it('summarizes synced subtitle availability without returning lyrics text', () => {
    const result = summarizeMusixmatchPayload({
      message: {
        header: { status_code: 200 },
        body: {
          subtitle: {
            subtitle_body: '[00:01.00]Secret lyric line',
            subtitle_language: 'en',
            subtitle_format: 'lrc',
            subtitle_copyright: 'Copyright notice',
          },
        },
      },
    });

    expect(result).toEqual({
      provider: 'musixmatch',
      status: 'available',
      reason: null,
      kind: 'synced-lyrics',
      format: 'lrc',
      language: 'en',
      lineCount: 1,
      firstLineStart: 1,
      copyright: 'Copyright notice',
      apiStatusCode: 200,
    });
    expect(JSON.stringify(result)).not.toContain('Secret lyric line');
  });

  it('reports unavailable API statuses', () => {
    expect(
      summarizeMusixmatchPayload({
        message: {
          header: { status_code: 404, hint: 'subtitle not found' },
          body: {},
        },
      }),
    ).toEqual({
      provider: 'musixmatch',
      status: 'unavailable',
      reason: 'subtitle not found',
      apiStatusCode: 404,
    });
  });
});

describe('probeMusixmatchLyrics', () => {
  it('returns not-configured when the API key is absent', async () => {
    const original = process.env[MUSIXMATCH_API_KEY_ENV];
    delete process.env[MUSIXMATCH_API_KEY_ENV];
    try {
      await expect(
        probeMusixmatchLyrics({ title: 'Song', artist: 'Artist' }),
      ).resolves.toEqual({
        provider: 'musixmatch',
        status: 'not-configured',
        reason: 'missing-api-key',
        requiredEnv: MUSIXMATCH_API_KEY_ENV,
      });
    } finally {
      if (original === undefined) {
        delete process.env[MUSIXMATCH_API_KEY_ENV];
      } else {
        process.env[MUSIXMATCH_API_KEY_ENV] = original;
      }
    }
  });

  it('fetches matcher subtitle data and returns a sanitized summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            header: { status_code: 200 },
            body: {
              subtitle: {
                subtitle_body: '[00:02.00]A private lyric line',
                subtitle_language: 'en',
              },
            },
          },
        }),
      ),
    );

    const result = await probeMusixmatchLyrics(
      {
        title: 'Song',
        artist: 'Artist',
        duration: 120,
      },
      {
        apiKey: 'test-key',
        fetch: fetchMock,
        baseUrl: 'https://api.example.test/ws/1.1',
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe('/ws/1.1/matcher.subtitle.get');
    expect(url.searchParams.get('q_track')).toBe('Song');
    expect(url.searchParams.get('q_artist')).toBe('Artist');
    expect(url.searchParams.get('apikey')).toBe('test-key');
    expect(result).toMatchObject({
      provider: 'musixmatch',
      status: 'available',
      lineCount: 1,
      firstLineStart: 2,
    });
    expect(JSON.stringify(result)).not.toContain('A private lyric line');
  });
});
