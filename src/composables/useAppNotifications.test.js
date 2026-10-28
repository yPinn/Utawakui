import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.resetModules());
async function load() {
  return (await import('./useAppNotifications.js')).useAppNotifications();
}

describe('app notification owner', () => {
  it('keeps purpose and explicit dismissal separate from tone without adding a default close action', async () => {
    const owner = await load();
    const result = owner.notify({ key: 'plain-result', title: '完成' });
    const confirmation = owner.notify({
      key: 'confirm-result',
      title: '請確認',
      tone: 'success',
      variant: 'confirmation',
    });
    const custom = owner.notify({
      key: 'custom-dismiss',
      title: '進度',
      lifecycle: 'progress',
      dismissLabel: '隱藏',
    });
    expect(
      owner.items.value.find((item) => item.id === result).dismissLabel,
    ).toBeUndefined();
    expect(
      owner.items.value.find((item) => item.id === confirmation).variant,
    ).toBe('confirmation');
    expect(
      owner.items.value.find((item) => item.id === confirmation).lifecycle,
    ).toBe('persistent');
    expect(
      owner.items.value.find((item) => item.id === custom).dismissLabel,
    ).toBe('隱藏');
    for (const id of [result, confirmation, custom]) owner.dismiss(id);
  });
  it('does not let a late failed retry replace a newer result', async () => {
    const owner = await load();
    let reject;
    const id = owner.notify({
      key: 'export',
      title: '失敗',
      action: () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    });
    const pending = owner.runAction(id);
    owner.notify({ key: 'export', title: '最新匯出成功' });
    reject(new Error('private'));
    await pending;
    expect(owner.items.value.map((item) => item.title)).toEqual([
      '最新匯出成功',
    ]);
  });
  it('updates task projections in place and drops updates from superseded attempts', async () => {
    const owner = await load();
    const id = owner.notify({
      key: 'task:model',
      title: '準備中',
      lifecycle: 'progress',
      tone: 'info',
      progress: 0,
    });
    expect(owner.update(id, { message: '下載中', progress: 35 })).toBe(true);
    expect(owner.items.value[0]).toMatchObject({
      id,
      lifecycle: 'progress',
      progress: 35,
    });
    owner.notify({ key: 'task:model', title: '新嘗試', lifecycle: 'progress' });
    expect(owner.update(id, { title: '舊結果' })).toBe(false);
    expect(owner.items.value).toHaveLength(1);
    expect(owner.items.value[0].title).toBe('新嘗試');
  });
  it('shares notifications and replaces only the same operation', async () => {
    const owner = await load();
    const first = owner.notify({ key: 'clear', title: '已清除' });
    owner.notify({ key: 'export', title: '已匯出' });
    const latest = owner.notify({ key: 'clear', title: '再次清除' });
    expect((await load()).items.value.map(({ title }) => title)).toEqual([
      '已匯出',
      '再次清除',
    ]);
    expect(first).not.toBe(latest);
    owner.dismiss(first);
    expect(owner.items.value).toHaveLength(2);
    owner.dismiss(latest);
    expect(owner.items.value).toHaveLength(1);
  });
  it('makes success transient and failures persistent without serializing callbacks', async () => {
    const owner = await load();
    const retry = vi.fn();
    owner.notify({ key: 'saved', title: '已完成' });
    const id = owner.notify({
      key: 'export',
      title: '匯出失敗',
      tone: 'danger',
      actionLabel: '重試',
      action: retry,
    });
    expect(owner.items.value[0]).toMatchObject({
      lifecycle: 'transient',
      announcement: 'polite',
      dismissible: true,
    });
    expect(owner.items.value[1]).toMatchObject({
      lifecycle: 'persistent',
      actionLabel: '重試',
    });
    expect(owner.items.value[1]).not.toHaveProperty('action');
    await owner.runAction(id);
    await owner.runAction(id);
    expect(retry).toHaveBeenCalledOnce();
    expect(owner.items.value).toHaveLength(1);
  });
  it('discards stale retries and keeps a result emitted by the current retry', async () => {
    const owner = await load();
    const stale = vi.fn();
    const oldId = owner.notify({
      key: 'export',
      title: '失敗',
      actionLabel: '重試',
      action: stale,
    });
    const id = owner.notify({
      key: 'export',
      title: '重試',
      actionLabel: '重試',
      action: () => owner.notify({ key: 'export', title: '已匯出' }),
    });
    await owner.runAction(oldId);
    await owner.runAction(id);
    expect(stale).not.toHaveBeenCalled();
    expect(owner.items.value.map(({ title }) => title)).toEqual(['已匯出']);
  });
  it('bounds unexpected retry errors to public copy', async () => {
    const owner = await load();
    const id = owner.notify({
      key: 'export',
      title: '失敗',
      actionLabel: '重試',
      action: () => {
        throw new Error('E:\\private');
      },
    });
    await expect(owner.runAction(id)).resolves.toBe(false);
    expect(JSON.stringify(owner.items.value)).not.toContain('private');
    expect(owner.items.value[0]).toMatchObject({
      tone: 'danger',
      title: '操作未完成',
    });
  });
  it('keeps a visible identical failure instead of re-entering it', async () => {
    const owner = await load();
    const first = vi.fn();
    const latest = vi.fn();
    const failure = (action) => ({
      key: 'autosave',
      title: '配置未儲存',
      message: '請再試一次。',
      tone: 'danger',
      actionLabel: '重試',
      action,
    });
    const id = owner.notify(failure(first));
    const item = owner.items.value[0];

    expect(owner.notify(failure(latest))).toBe(id);
    expect(owner.items.value).toEqual([item]);
    await owner.runAction(id);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  });
  it('still re-enters changed, transient or dismissed results', async () => {
    const owner = await load();
    const failed = { key: 'save', title: '未儲存', tone: 'danger' };
    const id = owner.notify(failed);
    const changed = owner.notify({ ...failed, message: '請稍後再試。' });
    expect(changed).not.toBe(id);
    owner.dismiss(changed);
    expect(owner.notify({ ...failed, message: '請稍後再試。' })).not.toBe(
      changed,
    );
    const copied = owner.notify({ key: 'copy', title: '已複製' });
    expect(owner.notify({ key: 'copy', title: '已複製' })).not.toBe(copied);
  });
  it('records a failure once and shows the same bounded public message', async () => {
    const recordDiagnostic = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('window', { Utawakui: { recordDiagnostic } });
    const owner = await load();
    const message = owner.notifyFailure({
      key: 'download',
      title: '下載未完成',
      message: '請再試一次。',
      error: new Error('C:\\private\\song.mp3'),
      code: 'DOWNLOAD_FAILED',
      source: 'library',
      operation: 'download',
    });

    expect(message).toBe('請再試一次。');
    expect(owner.items.value[0]).toMatchObject({
      title: '下載未完成',
      message: '請再試一次。',
      tone: 'danger',
      lifecycle: 'persistent',
    });
    expect(recordDiagnostic).toHaveBeenCalledOnce();
    expect(JSON.stringify(recordDiagnostic.mock.calls)).not.toContain(
      'private',
    );

    const recorded = new Error(
      `UTAWAKUI_APP_ERROR:${JSON.stringify({
        code: 'LIBRARY_FAILED',
        message: '曲庫暫時無法讀取。',
        context: { diagnosticRecorded: true },
      })}`,
    );
    owner.notifyFailure({ key: 'read', title: '讀取未完成', error: recorded });
    expect(recordDiagnostic).toHaveBeenCalledOnce();
    expect(owner.items.value[1].message).toBe('曲庫暫時無法讀取。');
    vi.unstubAllGlobals();
  });
  it('records a repeated visible failure once per incident', async () => {
    const recordDiagnostic = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('window', { Utawakui: { recordDiagnostic } });
    const owner = await load();
    const fail = () =>
      owner.notifyFailure({
        key: 'layout',
        title: '配置未儲存',
        message: '請再試一次。',
        error: new Error('offline'),
        code: 'LAYOUT_FAILED',
        source: 'library',
        operation: 'layout',
      });

    const first = fail();
    fail();
    expect(recordDiagnostic).toHaveBeenCalledOnce();
    expect(owner.items.value).toHaveLength(1);

    owner.dismiss(owner.items.value[0].id);
    expect(fail()).toBe(first);
    expect(recordDiagnostic).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
