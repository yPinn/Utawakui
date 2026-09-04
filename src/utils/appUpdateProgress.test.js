import { describe, expect, it } from 'vitest';
import { formatDownloadProgress } from './appUpdateProgress.js';

describe('formatDownloadProgress', () => {
  it('combines percent, rate, and remaining time', () => {
    expect(
      formatDownloadProgress({
        progress: 42.3,
        downloadBytesPerSecond: 3_145_728,
        downloadEtaSeconds: 25,
      }),
    ).toBe('正在下載 42.3% · 3.0 MB/s · 剩餘約 25 秒');
  });

  it('uses KB/s below one megabyte per second', () => {
    expect(
      formatDownloadProgress({ progress: 5, downloadBytesPerSecond: 400_000 }),
    ).toBe('正在下載 5% · 391 KB/s');
  });

  it('scales the ETA to minutes and hours', () => {
    expect(
      formatDownloadProgress({ progress: 10, downloadEtaSeconds: 180 }),
    ).toBe('正在下載 10% · 剩餘約 3 分');
    expect(
      formatDownloadProgress({ progress: 10, downloadEtaSeconds: 7200 }),
    ).toBe('正在下載 10% · 剩餘約 2 小時');
  });

  it('drops unknown parts and falls back when nothing is known', () => {
    expect(formatDownloadProgress({ progress: 0 })).toBe('正在下載 0%');
    expect(
      formatDownloadProgress({
        progress: null,
        downloadBytesPerSecond: null,
        downloadEtaSeconds: null,
      }),
    ).toBe('正在下載中');
    expect(formatDownloadProgress()).toBe('正在下載中');
  });
});
