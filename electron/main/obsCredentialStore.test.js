import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createObsCredentialStore } from './obsCredentialStore.js';

function fakeSafeStorage({ available = true } = {}) {
  return {
    isEncryptionAvailable: vi.fn(() => available),
    // A deliberately reversible "encryption" stand-in — real DPAPI behavior
    // isn't testable outside Windows; this only needs to prove the store
    // round-trips whatever bytes safeStorage hands back.
    encryptString: vi.fn((value) => Buffer.from(`enc:${value}`, 'utf8')),
    decryptString: vi.fn((buffer) =>
      buffer.toString('utf8').replace(/^enc:/, ''),
    ),
  };
}

function fakeApp(userDataDir) {
  return { getPath: vi.fn(() => userDataDir) };
}

describe('obsCredentialStore', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-obs-credential-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips a password through save/load', () => {
    const store = createObsCredentialStore({
      app: fakeApp(dir),
      safeStorage: fakeSafeStorage(),
    });

    expect(store.savePassword('hunter2')).toBe(true);
    expect(store.hasPassword()).toBe(true);
    expect(store.loadPassword()).toBe('hunter2');
  });

  it('returns null with no stored password and no leftover file', () => {
    const store = createObsCredentialStore({
      app: fakeApp(dir),
      safeStorage: fakeSafeStorage(),
    });

    expect(store.hasPassword()).toBe(false);
    expect(store.loadPassword()).toBe(null);
  });

  it('clearPassword removes the file so a later load returns null', () => {
    const store = createObsCredentialStore({
      app: fakeApp(dir),
      safeStorage: fakeSafeStorage(),
    });

    store.savePassword('hunter2');
    expect(store.clearPassword()).toBe(true);
    expect(store.hasPassword()).toBe(false);
    expect(store.loadPassword()).toBe(null);
  });

  it('never writes a credential file when encryption is unavailable', () => {
    const store = createObsCredentialStore({
      app: fakeApp(dir),
      safeStorage: fakeSafeStorage({ available: false }),
    });

    expect(store.savePassword('hunter2')).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(store.loadPassword()).toBe(null);
  });

  it('surfaces a corrupt/undecryptable credential file as null, not a throw', () => {
    fs.writeFileSync(
      path.join(dir, 'obs-credentials.bin'),
      'not-encrypted-bytes',
    );
    const brokenSafeStorage = fakeSafeStorage();
    brokenSafeStorage.decryptString.mockImplementation(() => {
      throw new Error('bad ciphertext');
    });
    const brokenStore = createObsCredentialStore({
      app: fakeApp(dir),
      safeStorage: brokenSafeStorage,
    });

    expect(brokenStore.loadPassword()).toBe(null);
  });
});
