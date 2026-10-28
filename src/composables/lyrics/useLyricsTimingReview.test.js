import { reactive, shallowRef, effectScope, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLyricsTimingReview } from './useLyricsTimingReview.js';

const scopes = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
});
async function setup() {
  const state = reactive({
    selectedTrackId: 'a',
    selectedSourceFilename: 'main.lrc',
    offsetSeconds: 0,
  });
  const sourceSession = shallowRef({
    id: 'a',
    timingRevision: 't1',
    offsetRevision: 'o1',
  });
  const bridge = {
    getLyricsTimingReview: vi.fn(async () => ({
      status: 'unconfirmed',
      token: 'ready',
      coverage: { timed: 2, total: 2 },
    })),
    confirmLyricsTimingReview: vi.fn(async () => ({
      status: 'confirmed',
      revision: 'r1',
    })),
    revokeLyricsTimingReview: vi.fn(async () => ({
      status: 'revoked',
      revision: 'r2',
    })),
    cancelLyricsTimingReview: vi.fn(async () => ({ status: 'cancelled' })),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  const saved = vi.fn(async () => true),
    barrier = vi.fn(async () => true),
    onSaved = vi.fn();
  let offsetIntent = 0;
  const scope = effectScope();
  scopes.push(scope);
  const owner = scope.run(() =>
    useLyricsTimingReview({
      state,
      sourceSession,
      waitForSavedOffset: barrier,
      saveTimingDocument: saved,
      reportLyricsError: (_e, _op, message) => message,
      getOffsetIntentRevision: () => offsetIntent,
    }),
  );
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  return {
    state,
    sourceSession,
    bridge,
    saved,
    barrier,
    owner,
    onSaved,
    changeOffset: () => {
      offsetIntent++;
    },
  };
}

describe('human confirmation sequencing', () => {
  it('cancels the exact dispatched token and ignores its late success', async () => {
    const f = await setup(),
      pending = Promise.withResolvers();
    f.bridge.confirmLyricsTimingReview.mockReturnValueOnce(pending.promise);
    const confirming = f.owner.confirm();
    await Promise.resolve();
    await Promise.resolve();
    f.owner.cancel();
    expect(f.bridge.cancelLyricsTimingReview).toHaveBeenCalledWith('ready');
    pending.resolve({ status: 'confirmed' });
    expect(await confirming).toBe(false);
    expect(f.owner.state.status).not.toBe('confirmed');
    expect(f.owner.state.isBusy).toBe(false);
  });
  it('saves timing, settles offset, fresh-reads and confirms in order without resending timing', async () => {
    const f = await setup(),
      order = [];
    f.saved.mockImplementation(async () => {
      order.push('save');
      return true;
    });
    f.barrier.mockImplementation(async () => {
      order.push('offset');
      return true;
    });
    f.bridge.getLyricsTimingReview.mockImplementation(async () => {
      order.push('read');
      return { status: 'unconfirmed', token: 'fresh' };
    });
    f.bridge.confirmLyricsTimingReview.mockImplementation(async () => {
      order.push('confirm');
      return { status: 'confirmed' };
    });
    expect(
      await f.owner.confirm({
        document: { documentId: 'draft' },
        baseline: f.sourceSession.value,
        onSaved: f.onSaved,
      }),
    ).toBe(true);
    expect(order).toEqual(['save', 'offset', 'read', 'confirm']);
    expect(f.onSaved).toHaveBeenCalledOnce();
    expect(f.owner.state.status).toBe('confirmed');
  });
  it('retains partial success and retries only confirmation after an offset failure', async () => {
    const f = await setup();
    f.barrier.mockResolvedValueOnce(false);
    expect(await f.owner.confirm({ document: {}, onSaved: f.onSaved })).toBe(
      false,
    );
    expect(f.onSaved).toHaveBeenCalledOnce();
    expect(f.owner.state.error).toContain('時間已儲存');
    expect(f.bridge.confirmLyricsTimingReview).not.toHaveBeenCalled();
    expect(await f.owner.confirm()).toBe(true);
    expect(f.saved).toHaveBeenCalledOnce();
  });
  it('keeps a failed timing draft and does not enter confirmation', async () => {
    const f = await setup();
    f.saved.mockResolvedValue(false);
    expect(await f.owner.confirm({ document: {}, onSaved: f.onSaved })).toBe(
      false,
    );
    expect(f.onSaved).not.toHaveBeenCalled();
    expect(f.barrier).not.toHaveBeenCalled();
    expect(f.bridge.confirmLyricsTimingReview).not.toHaveBeenCalled();
    expect(f.owner.state.isBusy).toBe(false);
  });
  it('reports unavailable reads, recovers by reload and never duplicates a busy confirmation', async () => {
    const f = await setup();
    f.bridge.getLyricsTimingReview.mockRejectedValueOnce(Error('private'));
    expect(await f.owner.refresh()).toBeNull();
    expect(f.owner.state.status).toBe('unavailable');
    expect(f.owner.state.error).toContain('無法讀取');
    expect(await f.owner.reload()).toMatchObject({ status: 'unconfirmed' });
    const pending = Promise.withResolvers();
    f.barrier.mockReturnValueOnce(pending.promise);
    const first = f.owner.confirm();
    expect(await f.owner.confirm()).toBe(false);
    expect(await f.owner.reload()).toBeNull();
    pending.resolve(true);
    expect(await first).toBe(true);
    expect(f.bridge.confirmLyricsTimingReview).toHaveBeenCalledOnce();
  });
  it('does not allow a late readonly load to replace a newer source status', async () => {
    const f = await setup(),
      pending = Promise.withResolvers();
    f.bridge.getLyricsTimingReview.mockReturnValueOnce(pending.promise);
    const old = f.owner.refresh();
    f.state.selectedTrackId = 'b';
    f.sourceSession.value = { id: 'b' };
    await nextTick();
    await Promise.resolve();
    await Promise.resolve();
    pending.resolve({ status: 'confirmed' });
    expect(await old).toBeNull();
    expect(f.owner.state.status).toBe('unconfirmed');
  });
  it('handles an unavailable bridge without claiming confirmation', async () => {
    const f = await setup();
    window.Utawakui = {};
    expect(await f.owner.refresh()).toBeNull();
    expect(f.owner.state.status).toBe('unavailable');
    f.sourceSession.value = null;
    expect(await f.owner.confirm()).toBe(false);
  });
  it.each(['offset', 'draft', 'source'])(
    'stops before receipt when %s changes during the offset barrier',
    async (kind) => {
      const f = await setup(),
        pending = Promise.withResolvers();
      f.barrier.mockReturnValue(pending.promise);
      let draftCurrent = true;
      const confirm = f.owner.confirm({ isCurrent: () => draftCurrent });
      if (kind === 'offset') f.changeOffset();
      if (kind === 'draft') draftCurrent = false;
      if (kind === 'source') {
        f.state.selectedTrackId = 'b';
        f.sourceSession.value = { id: 'b' };
      }
      pending.resolve(true);
      expect(await confirm).toBe(false);
      expect(f.bridge.confirmLyricsTimingReview).not.toHaveBeenCalled();
      expect(f.owner.state.isBusy).toBe(false);
    },
  );
  it('recovers an already committed receipt after a lost response', async () => {
    const f = await setup();
    f.bridge.confirmLyricsTimingReview.mockImplementation(async () => {
      f.bridge.getLyricsTimingReview.mockResolvedValue({
        status: 'confirmed',
        revision: 'r1',
      });
      throw Error('response lost');
    });
    expect(await f.owner.confirm()).toBe(true);
    expect(f.bridge.confirmLyricsTimingReview).toHaveBeenCalledOnce();
    expect(f.owner.state.error).toBeNull();
  });
  it('leaves a saved timing result when confirmation fails and reports the separate failure', async () => {
    const f = await setup();
    f.bridge.confirmLyricsTimingReview.mockRejectedValue(Error('conflict'));
    expect(await f.owner.confirm({ document: {}, onSaved: f.onSaved })).toBe(
      false,
    );
    expect(f.owner.state.error).toContain('時間已儲存；確認未完成');
    expect(f.saved).toHaveBeenCalledOnce();
  });
  it('isolates a late failure and finally after A-B-A while a newer confirmation is pending', async () => {
    const f = await setup(),
      old = Promise.withResolvers(),
      next = Promise.withResolvers();
    f.bridge.confirmLyricsTimingReview
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    const first = f.owner.confirm();
    await Promise.resolve();
    await Promise.resolve();
    f.state.selectedTrackId = 'b';
    f.sourceSession.value = { id: 'b' };
    f.state.selectedTrackId = 'a';
    f.sourceSession.value = { id: 'new-a' };
    await nextTick();
    await Promise.resolve();
    const second = f.owner.confirm();
    await Promise.resolve();
    await Promise.resolve();
    old.reject(Error('private'));
    expect(await first).toBe(false);
    expect(f.owner.state.isBusy).toBe(true);
    expect(f.owner.state.error).toBeNull();
    next.resolve({ status: 'confirmed' });
    expect(await second).toBe(true);
  });
  it('revokes without touching timing saves and refuses non-applicable confirmation', async () => {
    const f = await setup();
    expect(await f.owner.revoke()).toBe(true);
    expect(f.saved).not.toHaveBeenCalled();
    f.bridge.getLyricsTimingReview.mockResolvedValue({
      status: 'not-applicable',
    });
    expect(await f.owner.confirm()).toBe(false);
    expect(f.bridge.confirmLyricsTimingReview).not.toHaveBeenCalled();
  });
});
