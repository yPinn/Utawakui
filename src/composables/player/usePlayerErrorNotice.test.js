import { effectScope, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { usePlayerErrorNotice } from './usePlayerErrorNotice.js';

function setup() {
  const state = reactive({ error: null });
  const notifications = { notify: vi.fn(), clear: vi.fn() };
  const retry = vi.fn();
  const scope = effectScope();
  scope.run(() => usePlayerErrorNotice({ state, retry, notifications }));
  return { state, notifications, retry, scope };
}

describe('usePlayerErrorNotice', () => {
  it('publishes a persistent retryable notice for a playback error', () => {
    const { state, notifications, retry, scope } = setup();
    state.error = '目前無法播放這首曲目，請再試一次。';

    expect(notifications.notify).toHaveBeenCalledOnce();
    const notice = notifications.notify.mock.calls[0][0];
    expect(notice).toMatchObject({
      key: 'player-playback',
      title: '播放未完成',
      message: '目前無法播放這首曲目，請再試一次。',
      tone: 'danger',
      lifecycle: 'persistent',
      actionLabel: '重試',
    });
    notice.action();
    expect(retry).toHaveBeenCalledOnce();
    scope.stop();
  });

  it('withdraws the notice once the error clears', () => {
    const { state, notifications, scope } = setup();
    state.error = '播放失敗';
    state.error = null;

    expect(notifications.clear).toHaveBeenCalledWith('player-playback');
    scope.stop();
  });

  it('republishes when a retry fails again with the same message', () => {
    const { state, notifications, scope } = setup();
    state.error = '播放失敗';
    // play() clears the error before the retried start fails again.
    state.error = null;
    state.error = '播放失敗';

    expect(notifications.notify).toHaveBeenCalledTimes(2);
    scope.stop();
  });
});
