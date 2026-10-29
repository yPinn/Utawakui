import { expect, it, vi } from 'vitest';
import { createGlobalShortcutReceiver } from './globalShortcutReceiver.js';
const id = (c) =>
  `${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`;
const active = [
  {
    command: 'player.next',
    chord: { key: 'k', ctrl: true, alt: false, shift: true },
  },
];
function fixture() {
  let stateListener,
    commandListener,
    blocked = false;
  const offer = {
    version: 1,
    receiverId: id('a'),
    offerId: id('b'),
    bootId: id('c'),
    generation: 2,
    active,
    role: 'main',
  };
  const bridge = {
    onKeyboardShortcutReceiverState: vi.fn((cb) => {
      stateListener = cb;
      return vi.fn();
    }),
    onGlobalShortcutCommand: vi.fn((cb) => {
      commandListener = cb;
      return vi.fn();
    }),
    connectKeyboardShortcutReceiver: vi.fn(async () => ({
      status: 'offered',
      offer,
    })),
    confirmKeyboardShortcutReceiver: vi.fn(async () => ({
      status: 'ready',
      offer: { ...offer, generation: 3 },
    })),
    admitGlobalShortcut: vi.fn(async () => ({
      status: 'admitted',
      role: 'main',
    })),
    releaseKeyboardShortcutReceiver: vi.fn(async () => ({
      status: 'released',
    })),
  };
  const commands = {
    canExecute: vi.fn(() => true),
    execute: vi.fn(async () => ({ status: 'executed' })),
    invalidate: vi.fn(),
  };
  const receiver = createGlobalShortcutReceiver({
    bridge,
    commands,
    isBlocked: () => blocked,
    getRegistryRevision: () => 1,
  });
  const envelope = (sequence = 1) => ({
    version: 1,
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    bootId: offer.bootId,
    generation: 3,
    sequence,
    contextRevision: receiver.contextRevision(),
    command: 'player.next',
  });
  return {
    bridge,
    commands,
    receiver,
    offer,
    envelope,
    state: (v) => stateListener(v),
    command: (v) => commandListener(v),
    block: (v) => {
      blocked = v;
      receiver.contextChanged(true);
    },
  };
}
it('subscribes before install ACK, suppresses exact DOM repeats and executes one admitted command', async () => {
  const f = fixture();
  await f.receiver.ready;
  expect(
    f.bridge.onGlobalShortcutCommand.mock.invocationCallOrder[0],
  ).toBeLessThan(
    f.bridge.connectKeyboardShortcutReceiver.mock.invocationCallOrder[0],
  );
  expect(
    f.receiver.owns({ key: 'K', ctrlKey: true, shiftKey: true, repeat: true }),
  ).toBe(true);
  expect(f.receiver.owns({ key: 'K', ctrlKey: true, shiftKey: false })).toBe(
    false,
  );
  const packet = f.envelope();
  await f.receiver.receive(packet);
  await f.receiver.receive(packet);
  expect(f.commands.execute).toHaveBeenCalledTimes(1);
  expect(f.commands.execute).toHaveBeenCalledWith(
    'player.next',
    expect.objectContaining({ scope: 'global' }),
  );
  await f.receiver.dispose();
});
it('does not revive an old packet after a blocked context enters and exits during admission', async () => {
  const f = fixture();
  await f.receiver.ready;
  let release;
  f.bridge.admitGlobalShortcut.mockImplementationOnce(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const pending = f.receiver.receive(f.envelope());
  await Promise.resolve();
  f.block(true);
  f.block(false);
  release({ status: 'admitted', role: 'main' });
  await pending;
  expect(f.commands.execute).not.toHaveBeenCalled();
  expect(f.commands.invalidate).toHaveBeenCalledWith('global');
  await f.receiver.dispose();
});
it('does not execute stale leases, failed admission, or work arriving after unmount', async () => {
  const f = fixture();
  await f.receiver.ready;
  await f.receiver.receive({ ...f.envelope(), receiverId: id('d') });
  f.bridge.admitGlobalShortcut.mockResolvedValueOnce({ status: 'blocked' });
  await f.receiver.receive(f.envelope());
  await f.receiver.dispose();
  await f.receiver.receive(f.envelope(2));
  expect(f.commands.execute).not.toHaveBeenCalled();
  expect(f.bridge.releaseKeyboardShortcutReceiver).toHaveBeenCalledWith({
    receiverId: f.offer.receiverId,
  });
});
it('source changes reject pre-admission packets but do not invalidate another App command owner', async () => {
  const f = fixture();
  await f.receiver.ready;
  const packet = f.envelope();
  f.commands.invalidate.mockClear();
  f.receiver.contextChanged(false);
  await f.receiver.receive(packet);
  expect(f.commands.execute).not.toHaveBeenCalled();
  expect(f.commands.invalidate).not.toHaveBeenCalled();
  await f.receiver.dispose();
});
it('keeps a newer pushed offer when the initial connect snapshot arrives later', async () => {
  const f = fixture();
  let finish;
  await f.receiver.ready;
  f.bridge.connectKeyboardShortcutReceiver.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  // Control reconnect reply ordering after a completed first connection.
  const reconnect = f.receiver.reconnect();
  await Promise.resolve();
  await Promise.resolve();
  const next = {
    ...f.offer,
    receiverId: id('d'),
    offerId: id('e'),
    generation: 4,
  };
  f.state(next);
  f.bridge.confirmKeyboardShortcutReceiver.mockResolvedValue({
    status: 'ready',
    offer: { ...next, generation: 5 },
  });
  finish({
    status: 'offered',
    offer: { ...next, offerId: id('f'), generation: 3 },
  });
  await reconnect;
  const packet = {
    ...f.envelope(),
    receiverId: next.receiverId,
    offerId: next.offerId,
    generation: 5,
  };
  await f.receiver.receive(packet);
  expect(f.commands.execute).toHaveBeenCalledOnce();
  await f.receiver.dispose();
});
