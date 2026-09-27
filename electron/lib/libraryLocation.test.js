import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensureLibraryDirectory,
  inspectLibraryDirectory,
} from './libraryLocation.js';

const temporaryDirectories = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-library-'));
  temporaryDirectories.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirectories.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('library location availability', () => {
  it('reports a missing custom directory without creating it', () => {
    const missing = path.join(makeTempDir(), 'offline-drive-library');

    expect(inspectLibraryDirectory(missing)).toEqual({
      available: false,
      reason: 'missing',
    });
    expect(() => ensureLibraryDirectory(missing)).toThrow(
      /UTAWAKUI_APP_ERROR:/,
    );
    expect(fs.existsSync(missing)).toBe(false);
  });

  it('creates a missing default directory before declaring it available', () => {
    const missing = path.join(makeTempDir(), 'Music', 'Utawakui');

    expect(ensureLibraryDirectory(missing, { createIfMissing: true })).toBe(
      missing,
    );
    expect(fs.statSync(missing).isDirectory()).toBe(true);
  });

  it('rejects a file where a library directory is required', () => {
    const filePath = path.join(makeTempDir(), 'library.txt');
    fs.writeFileSync(filePath, 'not a directory');

    expect(inspectLibraryDirectory(filePath)).toEqual({
      available: false,
      reason: 'not-directory',
    });
  });

  it('maps access failures to a bounded reason without exposing the path', () => {
    const privatePath = 'C:\\private\\offline-library';
    const fsImpl = {
      statSync() {
        return { isDirectory: () => true };
      },
      accessSync() {
        throw Object.assign(new Error(`denied: ${privatePath}`), {
          code: 'EACCES',
        });
      },
    };

    expect(inspectLibraryDirectory(privatePath, { fsImpl })).toEqual({
      available: false,
      reason: 'access-denied',
    });
    try {
      ensureLibraryDirectory(privatePath, { fsImpl });
      throw new Error('expected unavailable directory to throw');
    } catch (error) {
      expect(error.code).toBe('LIBRARY_LOCATION_UNAVAILABLE');
      expect(error.message).not.toContain(privatePath);
      expect(error.message).toContain(
        '無法使用已設定的曲庫位置。請重新連接磁碟，或到設定選擇其他位置。',
      );
      expect(error.context).toEqual({
        reason: 'access-denied',
        retryable: true,
      });
    }
  });
});
