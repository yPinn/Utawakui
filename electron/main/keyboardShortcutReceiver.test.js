import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createKeyboardShortcutReceiver } from './keyboardShortcutReceiver.js';
const chord = { key: 'k', ctrl: true, alt: false, shift: true };
function fixture(options = {}) {
  const contents = new EventEmitter();
  Object.assign(contents, {
    mainFrame: {},
    send: vi.fn(),
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
  });
  const window = {
    webContents: contents,
    isDestroyed: () => false,
    isFocused: () => true,
  };
  let runtime = {
      bootId: 'a'.repeat(8) + '-aaaa-aaaa-aaaa-' + 'a'.repeat(12),
      generation: 2,
      state: 'active',
      busy: false,
      active: [{ command: 'player.next', chord }],
    },
    focused = window;
  const rearm = vi.fn(async (expected) => {
    if (expected !== runtime.generation) return null;
    runtime = { ...runtime, generation: runtime.generation + 1 };
    return runtime;
  });
  const receiver = createKeyboardShortcutReceiver({
    getMainWindow: () => window,
    getFocusedWindow: () => focused,
    getRuntime: () => runtime,
    rearm,
    ...options,
  });
  return {
    receiver,
    contents,
    window,
    rearm,
    runtime: () => runtime,
    setRuntime: (v) => {
      runtime = v;
    },
    focus: (v) => {
      focused = v;
    },
  };
}
it('revokes pending admission and future dispatch when the main renderer becomes unresponsive', async () => {
  const f = fixture(),
    { offer } = f.receiver.connect();
  await f.receiver.confirm({
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    contextRevision: 1,
  });
  f.receiver.dispatch({
    bootId: offer.bootId,
    generation: 3,
    sequence: 1,
    command: 'player.next',
  });
  f.contents.emit('unresponsive');
  expect(
    f.receiver.admit({
      receiverId: offer.receiverId,
      offerId: offer.offerId,
      sequence: 1,
    }).status,
  ).toBe('stale');
  expect(
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 3,
      sequence: 2,
      command: 'player.next',
    }),
  ).toBe(false);
});
it('offers a fresh active projection when focus changes during source rearming', async () => {
  const f = fixture(),
    { offer } = f.receiver.connect();
  let release;
  const arm = f.rearm.getMockImplementation();
  f.rearm.mockImplementationOnce(async (generation) => {
    f.setRuntime({ ...f.runtime(), busy: true });
    await new Promise((r) => {
      release = r;
    });
    f.setRuntime({ ...f.runtime(), busy: false });
    return arm(generation);
  });
  const ready = f.receiver.confirm({
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    contextRevision: 1,
  });
  f.receiver.refresh(true);
  release();
  expect((await ready).status).toBe('stale');
  const next = f.contents.send.mock.calls.at(-1)[1];
  expect(next.active).toHaveLength(1);
  expect(
    (
      await f.receiver.confirm({
        receiverId: next.receiverId,
        offerId: next.offerId,
        contextRevision: 2,
      })
    ).status,
  ).toBe('ready');
});
it('can connect during initial document loading and arms only after load completion', async () => {
  const f = fixture();
  let loading = true;
  f.contents.isLoadingMainFrame = () => loading;
  const { offer } = f.receiver.connect();
  f.receiver.refresh(true);
  expect(f.contents.listenerCount('did-finish-load')).toBe(1);
  expect(
    (
      await f.receiver.confirm({
        receiverId: offer.receiverId,
        offerId: offer.offerId,
        contextRevision: 1,
      })
    ).status,
  ).toBe('stale');
  loading = false;
  f.contents.emit('did-finish-load');
  const next = f.contents.send.mock.calls.at(-1)[1];
  expect(
    (
      await f.receiver.confirm({
        receiverId: next.receiverId,
        offerId: next.offerId,
        contextRevision: 2,
      })
    ).status,
  ).toBe('ready');
});
it('rejects main-frame navigation without treating subframe navigation as reload', async () => {
  const f = fixture(),
    { offer } = f.receiver.connect();
  await f.receiver.confirm({
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    contextRevision: 1,
  });
  f.contents.emit('did-start-navigation', { isMainFrame: false });
  expect(
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 3,
      sequence: 1,
      command: 'player.next',
    }),
  ).toBe(true);
  f.contents.emit('did-start-navigation', { isMainFrame: true });
  expect(
    f.receiver.admit({
      receiverId: offer.receiverId,
      offerId: offer.offerId,
      sequence: 1,
    }).status,
  ).toBe('stale');
});
it('bounds unconsumed admissions and expires them without replaying overflow', async () => {
  let time = 0;
  const f = fixture({ now: () => time }),
    { offer } = f.receiver.connect();
  await f.receiver.confirm({
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    contextRevision: 1,
  });
  const dispatch = (sequence) =>
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 3,
      sequence,
      command: 'player.next',
    });
  for (let sequence = 1; sequence <= 32; sequence++)
    expect(dispatch(sequence)).toBe(true);
  expect(dispatch(33)).toBe(false);
  time = 1000;
  expect(
    f.receiver.admit({
      receiverId: offer.receiverId,
      offerId: offer.offerId,
      sequence: 1,
    }).status,
  ).toBe('stale');
  expect(dispatch(33)).toBe(false);
  expect(dispatch(34)).toBe(true);
  expect(
    f.receiver.admit({
      receiverId: offer.receiverId,
      offerId: offer.offerId,
      sequence: 34,
    }).status,
  ).toBe('admitted');
});
it('installs ownership before a fresh source fence and drops pre-barrier notifications', async () => {
  const f = fixture(),
    offer = f.receiver.connect().offer;
  expect(
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 2,
      sequence: 1,
      command: 'player.next',
    }),
  ).toBe(false);
  const confirmed = await f.receiver.confirm({
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    contextRevision: 1,
  });
  expect(confirmed.status).toBe('ready');
  expect(f.rearm).toHaveBeenCalledWith(2);
  expect(
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 2,
      sequence: 2,
      command: 'player.next',
    }),
  ).toBe(false);
  expect(
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 3,
      sequence: 3,
      command: 'player.next',
    }),
  ).toBe(true);
  const envelope = f.contents.send.mock.calls.at(-1)[1];
  expect(
    f.receiver.admit({
      receiverId: offer.receiverId,
      offerId: offer.offerId,
      sequence: envelope.sequence,
    }).status,
  ).toBe('admitted');
  expect(
    f.receiver.admit({
      receiverId: offer.receiverId,
      offerId: offer.offerId,
      sequence: envelope.sequence,
    }).status,
  ).toBe('stale');
});
it('blocks Performer focus at admission and never brings a window forward', async () => {
  const f = fixture(),
    offer = f.receiver.connect().offer;
  await f.receiver.confirm({
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    contextRevision: 1,
  });
  f.receiver.dispatch({
    bootId: offer.bootId,
    generation: 3,
    sequence: 1,
    command: 'player.next',
  });
  f.focus({});
  expect(
    f.receiver.admit({
      receiverId: offer.receiverId,
      offerId: offer.offerId,
      sequence: 1,
    }).status,
  ).toBe('blocked');
  f.focus(null);
  f.window.isFocused = () => false;
  expect(
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 3,
      sequence: 2,
      command: 'player.next',
    }),
  ).toBe(true);
});
it('replaces receiver leases and ignores stale release, reload and old source packets', async () => {
  const f = fixture(),
    old = f.receiver.connect().offer,
    offer = f.receiver.connect().offer;
  f.receiver.release({ receiverId: old.receiverId });
  await f.receiver.confirm({
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    contextRevision: 1,
  });
  expect(
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 3,
      sequence: 1,
      command: 'player.next',
    }),
  ).toBe(true);
  f.contents.emit('render-process-gone');
  expect(
    f.receiver.dispatch({
      bootId: offer.bootId,
      generation: 3,
      sequence: 2,
      command: 'player.next',
    }),
  ).toBe(false);
  f.receiver.dispose();
  expect(f.contents.listenerCount('render-process-gone')).toBe(0);
});
