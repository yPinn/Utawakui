import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LOGIN_FILE_ERRORS,
  createYoutubeLoginStore,
  filterLoginCookies,
} from './youtubeLoginStore.js';

const COOKIES = [
  '# Netscape HTTP Cookie File',
  '# exported',
  '.youtube.com\tTRUE\t/\tTRUE\t1900000000\tSID\tabc',
  '#HttpOnly_.google.com\tTRUE\t/\tTRUE\t1900000000\tHSID\tdef',
  '.example.com\tTRUE\t/\tFALSE\t1900000000\ttrack\tzzz',
  'broken line',
].join('\r\n');

// Reversible stand-in for Electron safeStorage.
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`enc:${text}`, 'utf8'),
  decryptString: (buffer) => buffer.toString('utf8').replace(/^enc:/u, ''),
};

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'login-store-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function store(overrides = {}) {
  return createYoutubeLoginStore({
    safeStorage,
    filePath: path.join(dir, 'state', 'youtube-login.bin'),
    tempDir: dir,
    ...overrides,
  });
}

function writeSource(text) {
  const file = path.join(dir, 'cookies.txt');
  fs.writeFileSync(file, text);
  return file;
}

describe('filterLoginCookies', () => {
  it('keeps only YouTube and Google cookie lines under a Netscape header', () => {
    const kept = filterLoginCookies(COOKIES);
    expect(kept.split('\n')[0]).toBe('# Netscape HTTP Cookie File');
    expect(kept).toContain('\tSID\tabc');
    expect(kept).toContain('#HttpOnly_.google.com');
    expect(kept).not.toContain('example.com');
    expect(kept).not.toContain('broken line');
  });

  it('rejects files without the header or without YouTube sign-in', () => {
    expect(() => filterLoginCookies('SID=abc')).toThrow(
      LOGIN_FILE_ERRORS.FORMAT,
    );
    expect(() =>
      filterLoginCookies(
        '# HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t1\tx\ty',
      ),
    ).toThrow(LOGIN_FILE_ERRORS.NO_YOUTUBE);
  });
});

describe('createYoutubeLoginStore', () => {
  it('imports encrypted, reports status and removes', () => {
    const login = store();
    expect(login.getStatus()).toEqual({ imported: false });
    expect(login.importFile(writeSource(COOKIES))).toEqual({ imported: true });
    const saved = fs.readFileSync(path.join(dir, 'state', 'youtube-login.bin'));
    expect(saved.toString('utf8').startsWith('enc:')).toBe(true);
    expect(saved.toString('utf8')).not.toContain('example.com');
    expect(login.remove()).toEqual({ imported: false });
  });

  it('keeps the previous file when an import is rejected', () => {
    const login = store();
    login.importFile(writeSource(COOKIES));
    expect(() => login.importFile(writeSource('not cookies'))).toThrow(
      LOGIN_FILE_ERRORS.FORMAT,
    );
    expect(login.getStatus()).toEqual({ imported: true });
  });

  it('refuses to store without OS encryption', () => {
    const login = store({
      safeStorage: { ...safeStorage, isEncryptionAvailable: () => false },
    });
    expect(() => login.importFile(writeSource(COOKIES))).toThrow(
      LOGIN_FILE_ERRORS.STORAGE_UNAVAILABLE,
    );
  });

  it('hands one run a CRLF temp file, keeps rotated cookies and deletes it', async () => {
    const login = store();
    login.importFile(writeSource(COOKIES));
    let seen;
    await login.withCookieFile(async (file) => {
      seen = file;
      expect(fs.readFileSync(file, 'utf8')).toContain('\r\n');
      fs.writeFileSync(
        file,
        '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1900000000\tSID\trotated\n',
      );
    });
    expect(fs.existsSync(seen)).toBe(false);
    await login.withCookieFile(async (file) => {
      expect(fs.readFileSync(file, 'utf8')).toContain('\tSID\trotated');
    });
  });

  it('keeps the stored copy when a run leaves an unusable file', async () => {
    const login = store();
    login.importFile(writeSource(COOKIES));
    await expect(
      login.withCookieFile(async (file) => {
        fs.writeFileSync(file, '');
        throw new Error('download failed');
      }),
    ).rejects.toThrow('download failed');
    await login.withCookieFile(async (file) => {
      expect(fs.readFileSync(file, 'utf8')).toContain('\tSID\tabc');
    });
  });

  it('runs unsigned when nothing is stored', async () => {
    let received = 'unset';
    await store().withCookieFile(async (file) => {
      received = file;
    });
    expect(received).toBeNull();
  });
});
