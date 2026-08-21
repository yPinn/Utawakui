import { describe, it, expect, vi } from 'vitest';
import {
  ANONYMOUS_YOUTUBE_PHASES,
  AUTHENTICATED_YOUTUBE_PHASES,
  CLIENT_FALLBACK_YOUTUBE_PHASES,
  YOUTUBE_FALLBACK_PLAYER_CLIENTS,
  applyYoutubeRuntimeOptions,
  buildPhaseAttempts,
  getAuthenticatedYoutubePhases,
  isAudioFormatUnavailableError,
  isForbiddenAudioDownloadError,
  isRetryableMetadataError,
  isUnavailableBrowserCookieError,
  runPhasedYoutubeAttempts,
  youtubeExtractorArgs,
} from './youtubeAttempts.js';

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

describe('isAudioFormatUnavailableError', () => {
  it('detects a PO-token-blocked video offering only image formats', () => {
    expect(
      isAudioFormatUnavailableError({
        stderr:
          'WARNING: Only images are available for download. use --list-formats to see them\nERROR: Requested format is not available. Use --list-formats for a list of available formats',
      }),
    ).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(
      isAudioFormatUnavailableError({ stderr: 'ERROR: Video unavailable' }),
    ).toBe(false);
  });
});

describe('isUnavailableBrowserCookieError', () => {
  it('detects a missing browser cookie database', () => {
    expect(
      isUnavailableBrowserCookieError({
        stderr: 'ERROR: could not find chrome cookies database',
      }),
    ).toBe(true);
  });

  it('detects a Windows DPAPI decrypt failure', () => {
    expect(
      isUnavailableBrowserCookieError({
        stderr: 'ERROR: failed to decrypt with DPAPI',
      }),
    ).toBe(true);
  });

  it('does not match a browser-related failure with no cookie wording', () => {
    expect(
      isUnavailableBrowserCookieError({
        stderr: 'ERROR: unable to launch browser for verification',
      }),
    ).toBe(false);
  });
});

describe('isRetryableMetadataError', () => {
  it('retries on a bot-check challenge', () => {
    expect(
      isRetryableMetadataError({
        stderr: 'ERROR: Sign in to confirm you\u2019re not a bot',
      }),
    ).toBe(true);
  });

  it('retries when the player response cannot be extracted', () => {
    expect(
      isRetryableMetadataError({
        stderr: 'ERROR: Failed to extract any player response',
      }),
    ).toBe(true);
  });

  it('does not retry on a permanently unavailable video', () => {
    expect(
      isRetryableMetadataError({ stderr: 'ERROR: Video unavailable' }),
    ).toBe(false);
  });

  it('does not retry on a rate limit', () => {
    expect(
      isRetryableMetadataError({
        stderr: 'ERROR: HTTP Error 429: Too Many Requests',
      }),
    ).toBe(false);
  });
});

describe('buildPhaseAttempts', () => {
  it('layers each phase over the shared base options', () => {
    const attempts = buildPhaseAttempts(
      ANONYMOUS_YOUTUBE_PHASES,
      { skipDownload: true },
      isForbiddenAudioDownloadError,
    );
    expect(attempts.map((attempt) => attempt.options)).toEqual([
      { skipDownload: true, jsRuntimes: 'node' },
      {
        skipDownload: true,
        jsRuntimes: 'node',
        extractorArgs: 'youtube:player_js_version=actual',
      },
    ]);
  });

  it('retries a cookie phase on its own cookie-unavailable failure', () => {
    const attempts = buildPhaseAttempts(
      AUTHENTICATED_YOUTUBE_PHASES,
      {},
      isForbiddenAudioDownloadError,
    );
    const chromePhase = attempts.find(
      (attempt) => attempt.id === 'cookies-chrome',
    );
    expect(
      chromePhase.shouldRetry({
        stderr: 'ERROR: could not find chrome cookies database',
      }),
    ).toBe(true);
  });

  it('does not retry a non-cookie phase on a cookie-unavailable error', () => {
    const attempts = buildPhaseAttempts(
      ANONYMOUS_YOUTUBE_PHASES,
      {},
      isForbiddenAudioDownloadError,
    );
    expect(
      attempts[0].shouldRetry({
        stderr: 'ERROR: could not find chrome cookies database',
      }),
    ).toBe(false);
  });
});

describe('youtubeExtractorArgs', () => {
  it('combines player_client with the existing player_js_version fix', () => {
    expect(youtubeExtractorArgs('tv_simply')).toBe(
      'youtube:player_client=tv_simply;player_js_version=actual',
    );
  });

  it('falls back to the plain compat args when no client is given', () => {
    expect(youtubeExtractorArgs()).toBe('youtube:player_js_version=actual');
  });

  it('combines a manual PO token with its required client/context prefix', () => {
    expect(
      youtubeExtractorArgs('mweb', {
        poToken: 'mweb.gvs+TOKEN_VALUE',
        visitorData: 'VISITOR_DATA',
      }),
    ).toBe(
      'youtube:player_client=mweb;po_token=mweb.gvs+TOKEN_VALUE;visitor_data=VISITOR_DATA;player_js_version=actual',
    );
  });
});

describe('CLIENT_FALLBACK_YOUTUBE_PHASES', () => {
  it('sits between the anonymous phases and adds one phase per fallback client', () => {
    const ids = CLIENT_FALLBACK_YOUTUBE_PHASES.map((phase) => phase.id);
    expect(ids.slice(0, 2)).toEqual(['baseline', 'compat']);
    expect(ids.slice(2)).toEqual(
      YOUTUBE_FALLBACK_PLAYER_CLIENTS.map((client) => `client-${client}`),
    );
  });

  it('is spliced into AUTHENTICATED_YOUTUBE_PHASES before the cookie phases', () => {
    const ids = AUTHENTICATED_YOUTUBE_PHASES.map((phase) => phase.id);
    const cookieIndex = ids.indexOf('cookies-chrome');
    expect(ids.slice(0, cookieIndex)).toEqual(
      CLIENT_FALLBACK_YOUTUBE_PHASES.map((phase) => phase.id),
    );
  });
});

describe('getAuthenticatedYoutubePhases', () => {
  it('matches the default authenticated phases when no PO token env is configured', () => {
    expect(getAuthenticatedYoutubePhases({}).map((phase) => phase.id)).toEqual(
      AUTHENTICATED_YOUTUBE_PHASES.map((phase) => phase.id),
    );
  });

  it('adds one redacted manual PO-token phase before browser-cookie phases', () => {
    const phases = getAuthenticatedYoutubePhases({
      UTAWAKUI_YTDLP_PO_TOKEN: 'TOKEN_VALUE',
      UTAWAKUI_YTDLP_VISITOR_DATA: 'VISITOR_DATA',
    });
    const ids = phases.map((phase) => phase.id);
    const poTokenIndex = ids.indexOf('po-token-mweb-gvs');

    expect(poTokenIndex).toBeGreaterThan(ids.indexOf('client-mweb'));
    expect(poTokenIndex).toBeLessThan(ids.indexOf('cookies-chrome'));
    expect(ids).not.toContain('TOKEN_VALUE');
    expect(phases[poTokenIndex].options.extractorArgs).toBe(
      'youtube:player_client=mweb;po_token=mweb.gvs+TOKEN_VALUE;visitor_data=VISITOR_DATA;player_js_version=actual',
    );
  });

  it('accepts a fully-prefixed manual PO token without adding another prefix', () => {
    const phases = getAuthenticatedYoutubePhases({
      UTAWAKUI_YTDLP_PO_TOKEN: 'web.gvs+TOKEN_VALUE',
      UTAWAKUI_YTDLP_PO_TOKEN_CLIENT: 'web',
    });

    expect(
      phases.find((phase) => phase.id === 'po-token-web-gvs'),
    ).toMatchObject({
      options: {
        extractorArgs:
          'youtube:player_client=web;po_token=web.gvs+TOKEN_VALUE;player_js_version=actual',
      },
    });
  });

  it('ignores unsafe PO-token env values instead of injecting malformed extractor args', () => {
    const phases = getAuthenticatedYoutubePhases({
      UTAWAKUI_YTDLP_PO_TOKEN: 'TOKEN;player_client=all',
      UTAWAKUI_YTDLP_VISITOR_DATA: 'VISITOR_DATA',
    });

    expect(phases.map((phase) => phase.id)).toEqual(
      AUTHENTICATED_YOUTUBE_PHASES.map((phase) => phase.id),
    );
  });
});

describe('runPhasedYoutubeAttempts', () => {
  it('retries with the next attempt when the current one is retryable', async () => {
    const forbidden = Object.assign(new Error('403'), {
      stderr: 'ERROR: unable to download video data: HTTP Error 403: Forbidden',
    });
    const runner = vi
      .fn()
      .mockRejectedValueOnce(forbidden)
      .mockResolvedValueOnce('ok');

    await expect(
      runPhasedYoutubeAttempts(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        [
          {
            id: 'a',
            options: { format: 'bestaudio/best' },
            shouldRetry: () => true,
          },
          {
            id: 'b',
            options: { format: 'bestaudio[ext=m4a]' },
            shouldRetry: () => true,
          },
        ],
        runner,
      ),
    ).resolves.toBe('ok');

    expect(runner).toHaveBeenCalledTimes(2);
    expect(runner).toHaveBeenLastCalledWith(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      { format: 'bestaudio[ext=m4a]' },
    );
  });

  it('does not retry when the attempt reports it is not retryable', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('Private video'));

    await expect(
      runPhasedYoutubeAttempts(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        [
          {
            id: 'a',
            options: { format: 'bestaudio/best' },
            shouldRetry: () => false,
          },
          {
            id: 'b',
            options: { format: 'bestaudio[ext=m4a]' },
            shouldRetry: () => false,
          },
        ],
        runner,
      ),
    ).rejects.toThrow('Private video');

    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('stops after the last attempt even if it reports retryable', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('still failing'));

    await expect(
      runPhasedYoutubeAttempts(
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        [{ id: 'only', options: {}, shouldRetry: () => true }],
        runner,
      ),
    ).rejects.toThrow('still failing');

    expect(runner).toHaveBeenCalledTimes(1);
  });
});
