'use strict';

const youtubedl = require('youtube-dl-exec');

const DEFAULT_YOUTUBE_JS_RUNTIME = 'node';
// Do not exclude android_vr — without a PO token it's the one client that
// still serves real audio, not just images.
const FALLBACK_YOUTUBE_EXTRACTOR_ARGS = 'youtube:player_js_version=actual';
// firefox last: Chrome 127+ and current Edge both use App-Bound Encryption,
// which makes their cookies structurally undecryptable by any external tool
// on Windows (confirmed via yt-dlp's own DPAPI failure) — firefox isn't
// affected, so it's the fallback actually likely to work when it applies.
const YOUTUBE_COOKIE_FALLBACK_BROWSERS = ['chrome', 'edge', 'firefox'];

function applyYoutubeRuntimeOptions(options) {
  return {
    jsRuntimes:
      process.env.UTAWAKUI_YTDLP_JS_RUNTIME || DEFAULT_YOUTUBE_JS_RUNTIME,
    ...options,
  };
}

function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function downloadErrorText(error) {
  return `${error?.stderr || ''}\n${error?.message || ''}`;
}

function isForbiddenAudioDownloadError(error) {
  const text = downloadErrorText(error);
  return (
    /HTTP Error 403: Forbidden/i.test(text) &&
    /unable to download video data/i.test(text)
  );
}

// Same underlying cause as the 403 above (no valid PO token) but a different
// stderr shape: yt-dlp offers no real audio/video formats at all, only
// storyboard images — worth retrying with another client, same as a 403.
const AUDIO_FORMAT_UNAVAILABLE_RE =
  /Only images are available for download|Requested format is not available/i;

function isAudioFormatUnavailableError(error) {
  return AUDIO_FORMAT_UNAVAILABLE_RE.test(downloadErrorText(error));
}

// Requires "cookie" explicitly (a bare "unable to launch browser" must not
// count), plus Chrome's DPAPI decrypt failure — the common Windows failure.
const UNAVAILABLE_BROWSER_COOKIE_RE =
  /(?:could not|unable to|failed to)[^\n]*cookies?|failed to decrypt with dpapi/i;

function isUnavailableBrowserCookieError(error) {
  return UNAVAILABLE_BROWSER_COOKIE_RE.test(downloadErrorText(error));
}

// Allowlist, not denylist — runBackfillPass retries every needsBackfill
// track serially, so denylisting would double wall time on common permanent
// failures (unavailable/private/rate-limited).
const RETRYABLE_METADATA_ERROR_RE =
  /confirm you(?:'|’)?re not a bot|sign in to confirm your age|failed to extract any player response|unable to extract (?:yt initial data|player response|player version)/i;

function isRetryableMetadataError(error) {
  return RETRYABLE_METADATA_ERROR_RE.test(downloadErrorText(error));
}

// Authenticated phases read a live browser cookie database and must stay
// opt-in per call site — both a cost and a privacy boundary.
const ANONYMOUS_YOUTUBE_PHASES = [
  { id: 'baseline', options: {} },
  { id: 'compat', options: { extractorArgs: FALLBACK_YOUTUBE_EXTRACTOR_ARGS } },
];

// Only clients NOT already tried by yt-dlp's own default client set belong
// here — one already covered by default (e.g. android_vr, see the
// FALLBACK_YOUTUBE_EXTRACTOR_ARGS comment above) would just duplicate
// baseline/compat. Capped at 3 to bound worst-case download attempts.
const YOUTUBE_FALLBACK_PLAYER_CLIENTS = ['tv_simply', 'web_safari', 'mweb'];

// player_js_version is inert for clients that skip the JS player, so it's
// safe to carry through every client phase rather than branching per client.
function youtubeExtractorArgs(playerClient) {
  return playerClient
    ? `youtube:player_client=${playerClient};player_js_version=actual`
    : FALLBACK_YOUTUBE_EXTRACTOR_ARGS;
}

const PLAYER_CLIENT_YOUTUBE_PHASES = YOUTUBE_FALLBACK_PLAYER_CLIENTS.map(
  (client) => ({
    id: `client-${client}`,
    options: { extractorArgs: youtubeExtractorArgs(client) },
  }),
);

// A wider anonymous sweep for one-shot, user-initiated calls. Deliberately
// NOT folded into ANONYMOUS_YOUTUBE_PHASES — that list also feeds
// electron/lib/library/backfill.js's runBackfillPass, which retries serially per track, so
// widening it there would multiply background scan time.
const CLIENT_FALLBACK_YOUTUBE_PHASES = [
  ...ANONYMOUS_YOUTUBE_PHASES,
  ...PLAYER_CLIENT_YOUTUBE_PHASES,
];

const AUTHENTICATED_YOUTUBE_PHASES = [
  ...CLIENT_FALLBACK_YOUTUBE_PHASES,
  ...YOUTUBE_COOKIE_FALLBACK_BROWSERS.map((browser) => ({
    id: `cookies-${browser}`,
    options: {
      extractorArgs: FALLBACK_YOUTUBE_EXTRACTOR_ARGS,
      cookiesFromBrowser: browser,
    },
    retriesOwnFailure: isUnavailableBrowserCookieError,
  })),
  {
    id: 'impersonate',
    options: {
      extractorArgs: FALLBACK_YOUTUBE_EXTRACTOR_ARGS,
      impersonate: 'chrome',
    },
  },
];

// Splits "worth escalating" (caller-supplied) from "did this phase's own
// mechanism fail" (phase-supplied) — no reverse-engineering a phase's
// identity from its option shape.
function shouldRetryForPhase(phase, isRetryableError) {
  return (error) =>
    isRetryableError(error) || phase.retriesOwnFailure?.(error) === true;
}

function buildPhaseAttempts(phases, baseOptions, isRetryableError) {
  return phases.map((phase) => ({
    id: phase.id,
    options: applyYoutubeRuntimeOptions({ ...baseOptions, ...phase.options }),
    shouldRetry: shouldRetryForPhase(phase, isRetryableError),
  }));
}

async function runPhasedYoutubeAttempts(url, attempts, runner = youtubedl) {
  let lastError;
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      return await runner(url, attempts[index].options);
    } catch (err) {
      lastError = err;
      const canRetry =
        index < attempts.length - 1 && attempts[index].shouldRetry(err);
      if (!canRetry) throw err;
    }
  }
  throw lastError;
}

module.exports = {
  ANONYMOUS_YOUTUBE_PHASES,
  AUTHENTICATED_YOUTUBE_PHASES,
  CLIENT_FALLBACK_YOUTUBE_PHASES,
  FALLBACK_YOUTUBE_EXTRACTOR_ARGS,
  YOUTUBE_FALLBACK_PLAYER_CLIENTS,
  applyYoutubeRuntimeOptions,
  buildPhaseAttempts,
  downloadErrorText,
  isAudioFormatUnavailableError,
  isForbiddenAudioDownloadError,
  isRetryableMetadataError,
  isUnavailableBrowserCookieError,
  runPhasedYoutubeAttempts,
  shouldRetryForPhase,
  watchUrl,
  youtubeExtractorArgs,
};
