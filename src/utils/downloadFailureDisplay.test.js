import { describe, expect, it } from 'vitest';
import {
  DOWNLOAD_FAILURE_CODES,
  describeDownloadFailure,
  downloadFailureHint,
  downloadFailureLabel,
  downloadFailureTone,
  extractDownloadFailureCode,
} from './downloadFailureDisplay.js';

describe('extractDownloadFailureCode', () => {
  it('extracts the code from a real mangled Electron IPC message', () => {
    const message =
      "Error invoking remote method 'yt:download-audio': Error: utawakui-download-failed:bot-protected";
    expect(extractDownloadFailureCode(new Error(message))).toBe(
      'bot-protected',
    );
  });

  it('falls back to unknown for a bare, unclassified message', () => {
    expect(extractDownloadFailureCode(new Error('disk full'))).toBe('unknown');
  });

  it('falls back to unknown for an unrecognized sentinel code', () => {
    expect(
      extractDownloadFailureCode(
        new Error('utawakui-download-failed:not-a-real-code'),
      ),
    ).toBe('unknown');
  });
});

describe('downloadFailureLabel / Tone / Hint', () => {
  it('covers every known code with a non-fallback label', () => {
    for (const code of DOWNLOAD_FAILURE_CODES) {
      expect(downloadFailureLabel(code)).not.toBe('');
      expect(downloadFailureTone(code)).not.toBe('');
      expect(downloadFailureHint(code)).not.toBe('');
    }
  });

  it('gives members-only content the gated tone', () => {
    expect(downloadFailureTone('members-only')).toBe('gated');
  });
});

describe('describeDownloadFailure', () => {
  it('returns a single classified description from a raw error', () => {
    expect(
      describeDownloadFailure(new Error('utawakui-download-failed:disk-full')),
    ).toEqual({
      code: 'disk-full',
      label: '儲存空間不足',
      tone: 'danger',
      hint: '請清出空間，或到設定改用其他下載資料夾。',
    });
  });
});
