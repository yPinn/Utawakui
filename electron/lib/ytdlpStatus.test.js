import { describe, it, expect, vi } from 'vitest';
import {
  binaryExists,
  checkForUpdate,
  getInstalledVersion,
  getStatus,
  normalizeYtdlpStatusCache,
} from './ytdlpStatus.js';

describe('getInstalledVersion', () => {
  it('trims the yt-dlp --version output', async () => {
    const runner = vi.fn().mockResolvedValue('2026.07.04\n');
    await expect(getInstalledVersion({ runner })).resolves.toEqual({
      version: '2026.07.04',
      found: true,
    });
    expect(runner).toHaveBeenCalledWith(undefined, { version: true });
  });

  it('reports not-found when the binary fails to spawn', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('ENOENT'));
    await expect(getInstalledVersion({ runner })).resolves.toEqual({
      version: null,
      found: false,
    });
  });
});

describe('binaryExists', () => {
  it('checks the given binary path', () => {
    expect(binaryExists({ binaryPath: __filename })).toBe(true);
  });

  it('is false for a missing path', () => {
    expect(binaryExists({ binaryPath: 'Z:\\nowhere\\yt-dlp.exe' })).toBe(false);
  });

  it('is false when no path is available at all', () => {
    expect(binaryExists({ binaryPath: null })).toBe(false);
  });
});

describe('getStatus', () => {
  it('combines version lookup and binary presence', async () => {
    const runner = vi.fn().mockResolvedValue('2026.07.04');
    await expect(
      getStatus({ runner, binaryPath: __filename }),
    ).resolves.toEqual({ version: '2026.07.04', binaryFound: true });
  });

  it('is not found when the binary path does not exist even if the version call succeeded', async () => {
    const runner = vi.fn().mockResolvedValue('2026.07.04');
    await expect(
      getStatus({ runner, binaryPath: 'Z:\\nowhere\\yt-dlp.exe' }),
    ).resolves.toEqual({ version: '2026.07.04', binaryFound: false });
  });
});

describe('checkForUpdate', () => {
  it('classifies an already-up-to-date result', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce('yt-dlp is up to date (2026.07.04)')
      .mockResolvedValueOnce('2026.07.04');
    await expect(checkForUpdate({ runner })).resolves.toEqual(
      expect.objectContaining({ outcome: 'up-to-date', version: '2026.07.04' }),
    );
  });

  it('classifies a successful update', async () => {
    const runner = vi
      .fn()
      .mockResolvedValueOnce('Updated yt-dlp to version 2026.08.01')
      .mockResolvedValueOnce('2026.08.01');
    await expect(checkForUpdate({ runner })).resolves.toEqual(
      expect.objectContaining({ outcome: 'updated', version: '2026.08.01' }),
    );
    expect(runner).toHaveBeenCalledWith(undefined, { update: true });
  });

  it('classifies a spawn failure as an error', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('ENOENT'));
    await expect(checkForUpdate({ runner })).resolves.toEqual(
      expect.objectContaining({ outcome: 'error', version: null }),
    );
  });
});

describe('normalizeYtdlpStatusCache', () => {
  it('round-trips a well-formed cache', () => {
    const value = {
      lastCheckedAt: '2026-08-19T00:00:00.000Z',
      lastKnownVersion: '2026.07.04',
      lastCheckResult: 'up-to-date',
    };
    expect(normalizeYtdlpStatusCache(value)).toEqual(value);
  });

  it('drops wrong-typed or unknown fields instead of coercing them', () => {
    expect(
      normalizeYtdlpStatusCache({
        lastCheckedAt: 'not a date',
        lastKnownVersion: 123,
        lastCheckResult: 'bogus',
      }),
    ).toEqual({});
  });

  it('falls back to an empty object for missing/malformed input', () => {
    expect(normalizeYtdlpStatusCache(null)).toEqual({});
    expect(normalizeYtdlpStatusCache(undefined)).toEqual({});
    expect(normalizeYtdlpStatusCache([])).toEqual({});
    expect(normalizeYtdlpStatusCache('nope')).toEqual({});
  });
});
