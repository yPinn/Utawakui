import { describe, it, expect } from 'vitest';
import {
  DOWNLOAD_FAILURE_PREFIX,
  classifyDownloadFailure,
  toClassifiedDownloadError,
} from './downloadFailure.js';

describe('classifyDownloadFailure', () => {
  it('classifies an invalid video id/URL', () => {
    expect(
      classifyDownloadFailure(new Error('invalid video id or YouTube URL')),
    ).toBe('invalid-input');
  });

  it('classifies members-only content ahead of the generic unavailable case', () => {
    expect(
      classifyDownloadFailure({
        stderr:
          'ERROR: Video unavailable. This video is available to this channel’s members',
      }),
    ).toBe('members-only');
  });

  it('classifies age-restricted content', () => {
    expect(
      classifyDownloadFailure({
        stderr: 'ERROR: Sign in to confirm your age',
      }),
    ).toBe('age-restricted');
  });

  it('classifies a geo-blocked video ahead of the generic unavailable case', () => {
    expect(
      classifyDownloadFailure({
        stderr:
          'ERROR: Video unavailable. The uploader has not made this video available in your country',
      }),
    ).toBe('region-restricted');
  });

  it('classifies a plain unavailable/removed/private video', () => {
    expect(
      classifyDownloadFailure({ stderr: 'ERROR: Video unavailable' }),
    ).toBe('video-unavailable');
    expect(classifyDownloadFailure({ stderr: 'ERROR: Private video' })).toBe(
      'video-unavailable',
    );
  });

  it('classifies a rate limit', () => {
    expect(
      classifyDownloadFailure({
        stderr: 'ERROR: HTTP Error 429: Too Many Requests',
      }),
    ).toBe('rate-limited');
  });

  it('classifies a network failure', () => {
    expect(
      classifyDownloadFailure({
        stderr: 'ERROR: [youtube] dQw4w9WgXcQ: Unable to download webpage',
      }),
    ).toBe('network-error');
  });

  it('classifies disk-full', () => {
    expect(
      classifyDownloadFailure(new Error('ENOSPC: no space left on device')),
    ).toBe('disk-full');
  });

  it('classifies exhausted-fallback bot protection', () => {
    expect(
      classifyDownloadFailure({
        stderr:
          'ERROR: unable to download video data: HTTP Error 403: Forbidden',
      }),
    ).toBe('bot-protected');
  });

  it('classifies PO-token-blocked videos that only offer image formats', () => {
    expect(
      classifyDownloadFailure({
        stderr:
          'WARNING: Only images are available for download. use --list-formats to see them\nERROR: [youtube] Sw2SuVkxw78: Requested format is not available. Use --list-formats for a list of available formats',
      }),
    ).toBe('bot-protected');
  });

  it('falls back to unknown for an unrecognized error', () => {
    expect(classifyDownloadFailure(new Error('something else broke'))).toBe(
      'unknown',
    );
  });
});

describe('toClassifiedDownloadError', () => {
  it('produces a sentinel-prefixed error with no raw stderr content', () => {
    const err = toClassifiedDownloadError({
      stderr: 'ERROR: HTTP Error 429: Too Many Requests',
    });
    expect(err.message).toBe(`${DOWNLOAD_FAILURE_PREFIX}rate-limited`);
    expect(err.message).not.toContain('429');
  });
});
