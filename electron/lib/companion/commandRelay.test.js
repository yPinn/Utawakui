import { describe, expect, it, vi } from 'vitest';
import { createCommandRelay } from './commandRelay.js';

function setup(send) {
  const timers = [];
  let next = 0;
  const relay = createCommandRelay({
    send,
    createId: () => `id-${++next}`,
    setTimer: (fn) => (timers.push(fn), timers.length),
    clearTimer: (id) => (timers[id - 1] = null),
  });
  return { relay, fireTimers: () => timers.forEach((fn) => fn?.()) };
}

describe('companion command relay', () => {
  it('resolves with the renderer outcome for the matching id', async () => {
    const send = vi.fn(() => true);
    const { relay } = setup(send);
    const outcome = relay.dispatch({
      command: 'player.next',
      revision: 2,
      trackId: 'a',
    });
    expect(send).toHaveBeenCalledWith({
      id: 'id-1',
      command: 'player.next',
      revision: 2,
      trackId: 'a',
    });
    expect(relay.settle('other', 'applied')).toBe(false);
    expect(relay.settle('id-1', 'applied')).toBe(true);
    await expect(outcome).resolves.toBe('applied');
    expect(relay.settle('id-1', 'applied')).toBe(false);
  });

  it('maps unknown renderer statuses to failed', async () => {
    const { relay } = setup(() => true);
    const outcome = relay.dispatch({ command: 'player.mute' });
    relay.settle('id-1', 'whatever');
    await expect(outcome).resolves.toBe('failed');
  });

  it('times out without a reply and never queues when the renderer is missing', async () => {
    const { relay, fireTimers } = setup(() => true);
    const late = relay.dispatch({ command: 'player.mute' });
    fireTimers();
    await expect(late).resolves.toBe('timed_out');
    expect(relay.pendingCount()).toBe(0);

    const missing = setup(() => false);
    await expect(
      missing.relay.dispatch({ command: 'player.mute' }),
    ).resolves.toBe('unavailable');
    const throwing = setup(() => {
      throw new Error('destroyed');
    });
    await expect(
      throwing.relay.dispatch({ command: 'player.mute' }),
    ).resolves.toBe('unavailable');
  });
});
