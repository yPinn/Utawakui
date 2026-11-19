import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_DEVICES, createCompanionDeviceStore } from './deviceStore.js';

let dir;
let filePath;
let clock;
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`enc:${text}`),
  decryptString: (buffer) => String(buffer).replace(/^enc:/u, ''),
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-companion-'));
  filePath = path.join(dir, 'companion-devices.bin');
  clock = new Date('2026-11-17T12:00:00Z');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const createStore = (overrides = {}) =>
  createCompanionDeviceStore({
    filePath,
    safeStorage,
    now: () => clock,
    ...overrides,
  });

describe('companion device store', () => {
  it('stores only a credential hash and authenticates the phone after a restart', () => {
    const { device, credential } = createStore().add('  My Phone\u0007 ');
    expect(device.label).toBe('My Phone');
    const raw = fs.readFileSync(filePath, 'utf8');
    expect(raw.startsWith('enc:')).toBe(true);
    expect(raw).not.toContain(credential);

    const reopened = createStore();
    expect(reopened.list()).toEqual([device]);
    expect(reopened.authenticate(credential)).toMatchObject({ id: device.id });
    expect(reopened.authenticate('x'.repeat(43))).toBeNull();
    expect(reopened.authenticate('short')).toBeNull();
  });

  it('records last seen at most once a minute', () => {
    const store = createStore();
    const { credential } = store.add('Phone');
    clock = new Date('2026-11-17T12:00:30Z');
    store.authenticate(credential);
    expect(createStore().list()[0].lastSeenAt).toBe('2026-11-17T12:00:00.000Z');
    clock = new Date('2026-11-17T12:02:00Z');
    store.authenticate(credential);
    expect(createStore().list()[0].lastSeenAt).toBe('2026-11-17T12:02:00.000Z');
  });

  it('numbers a second phone of the same kind and keeps chosen names', () => {
    const store = createStore();
    expect(store.add('iPhone').device.label).toBe('iPhone');
    expect(store.uniqueLabel('iPhone')).toBe('iPhone 2');
    expect(store.add('iPhone').device.label).toBe('iPhone 2');
    expect(store.add('iPhone').device.label).toBe('iPhone 3');
    expect(store.add('Android').device.label).toBe('Android');
    const long = 'x'.repeat(40);
    store.add(long);
    expect(store.add(long).device.label).toBe(`${'x'.repeat(38)} 2`);
    expect(store.uniqueLabel('  ')).toBeNull();
  });

  it('renames a phone and keeps the name after a restart', () => {
    const store = createStore();
    const { device } = store.add('iPhone');
    expect(store.rename(device.id, ' 主唱的 iPhone ')).toMatchObject({
      id: device.id,
      label: '主唱的 iPhone',
    });
    expect(createStore().list()[0].label).toBe('主唱的 iPhone');
    expect(store.rename('missing', 'Name')).toBeNull();
    expect(() => store.rename(device.id, '\u0007 ')).toThrow(
      expect.objectContaining({ companionStatus: 'invalid' }),
    );
  });

  it('revokes one device or all devices', () => {
    const store = createStore();
    const a = store.add('A');
    const b = store.add('B');
    expect(store.revoke(a.device.id)).toBe(true);
    expect(store.revoke(a.device.id)).toBe(false);
    expect(store.authenticate(a.credential)).toBeNull();
    expect(store.authenticate(b.credential)).not.toBeNull();
    expect(store.revokeAll()).toBe(1);
    expect(createStore().list()).toEqual([]);
  });

  it('limits the number of devices and rejects empty labels', () => {
    const store = createStore();
    for (let i = 0; i < MAX_DEVICES; i++) store.add(`Phone ${i}`);
    expect(() => store.add('One more')).toThrow(
      expect.objectContaining({ companionStatus: 'full' }),
    );
    expect(() => createStore().add('   ')).toThrow(
      expect.objectContaining({ companionStatus: 'invalid' }),
    );
  });

  it('refuses to pair without OS-backed encryption', () => {
    const store = createStore({
      safeStorage: { ...safeStorage, isEncryptionAvailable: () => false },
    });
    expect(store.available()).toBe(false);
    expect(() => store.add('Phone')).toThrow(
      expect.objectContaining({
        companionStatus: 'secure-storage-unavailable',
      }),
    );
  });

  it('rejects a damaged store document', () => {
    fs.writeFileSync(filePath, 'enc:{"version":2}');
    expect(() => createStore().list()).toThrow(
      expect.objectContaining({ companionStatus: 'invalid' }),
    );
  });
});
