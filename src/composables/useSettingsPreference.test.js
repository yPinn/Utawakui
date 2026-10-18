import { describe, expect, it, vi } from 'vitest';
import { useSettingsPreference } from './useSettingsPreference.js';

function setup(overrides = {}) {
  return useSettingsPreference({
    initialValue: true,
    read: vi.fn().mockResolvedValue(true),
    write: vi.fn().mockRejectedValue(new Error('private')),
    validate: (value) => typeof value === 'boolean',
    readMessage: '讀取失敗',
    saveMessage: '儲存失敗',
    ...overrides,
  });
}

describe('settings preference feedback ownership', () => {
  it('shares a bridge preference across remounts without overlapping writes', async () => {
    const scope = {};
    let finish;
    const write = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = setup({ scope, key: 'close-behavior', write });
    const pending = first.save(false);
    const next = setup({ scope, key: 'close-behavior', write });
    expect(next.busy.value).toBe(true);
    await expect(next.save(true)).resolves.toBe(false);
    finish(false);
    await pending;
    expect(next.value.value).toBe(false);
    expect(write).toHaveBeenCalledOnce();
    expect(setup({ scope, key: 'gpu' })).not.toBe(next);
  });
  it('rejects unconfirmed writes, retries successfully, and clears both resolved failures', async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementation(async (value) => value);
    const preference = setup({
      read: vi.fn().mockRejectedValue(new Error('private')),
      write,
    });
    await preference.refresh();
    expect(await preference.save(false)).toBe(false);
    expect(preference.readError.value).toBe('讀取失敗');
    expect(preference.saveError.value).toBe('儲存失敗');
    expect(await preference.save(false)).toBe(true);
    expect(preference.readError.value).toBe('');
    expect(preference.saveError.value).toBe('');
    expect(preference.value.value).toBe(false);
  });

  it('ignores obsolete read rejections and prevents refreshes or writes overtaking a pending write', async () => {
    let rejectRead, resolveWrite;
    const read = vi.fn(
      () =>
        new Promise((_, reject) => {
          rejectRead = reject;
        }),
    );
    const write = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const preference = setup({ read, write });
    expect(await preference.save('invalid')).toBe(false);
    const pendingRead = preference.refresh();
    const pendingWrite = preference.save(false);
    expect(await preference.save(true)).toBe(false);
    expect(await preference.refresh()).toBe(false);
    expect(read).toHaveBeenCalledOnce();
    rejectRead(new Error('obsolete'));
    await pendingRead;
    resolveWrite(false);
    await pendingWrite;
    expect(preference.readError.value).toBe('');
    expect(preference.busy.value).toBe(false);
  });
  it('marks a failed read as unconfirmed and rejects malformed responses', async () => {
    const preference = setup({ read: vi.fn().mockResolvedValue(undefined) });
    await preference.refresh();
    expect(preference.loaded.value).toBe(false);
    expect(preference.readError.value).toBe('讀取失敗');
    expect(preference.error.value).toBe('讀取失敗');
    expect(preference.saveError.value).toBe('');
  });

  it('rolls back failed writes and preserves the failure after a status read', async () => {
    const preference = setup();
    await preference.refresh();
    expect(await preference.save(false)).toBe(false);
    expect(preference.value.value).toBe(true);
    await preference.refresh();
    expect(preference.readError.value).toBe('');
    expect(preference.saveError.value).toBe('儲存失敗');
    expect(preference.error.value).toBe('儲存失敗');
  });

  it('requires the bridge to confirm the requested value', async () => {
    const preference = setup({ write: vi.fn().mockResolvedValue(true) });
    expect(await preference.save(false)).toBe(false);
    expect(preference.value.value).toBe(true);
    expect(preference.loaded.value).toBe(false);
  });

  it('ignores a late read after a newer write, and clears only resolved failures', async () => {
    let resolveRead;
    const preference = setup({
      read: () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
      write: vi.fn().mockResolvedValue(false),
    });
    const pending = preference.refresh();
    expect(await preference.save(false)).toBe(true);
    resolveRead(true);
    await pending;
    expect(preference.value.value).toBe(false);
    expect(preference.loaded.value).toBe(true);
    expect(preference.reading.value).toBe(false);
  });
});
