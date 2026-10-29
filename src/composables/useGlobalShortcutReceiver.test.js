import { afterEach, expect, it, vi } from 'vitest';
import { h, reactive, ref } from 'vue';
import { setImmediate } from 'node:timers/promises';
import { mount } from '../components/ui/uiTestHost.js';
import { useGlobalShortcutReceiver } from './useGlobalShortcutReceiver.js';
const uuid = (c) =>
  `${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`;
let mounted, receiver;
afterEach(async () => {
  await receiver?.dispose();
  mounted?.app.unmount();
  receiver = null;
  mounted = null;
  vi.unstubAllGlobals();
});
function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => {
      if (listeners.get(name) === fn) listeners.delete(name);
    },
  };
}
async function fixture() {
  const doc = { ...target(), documentElement: {}, activeElement: null };
  let focused = true,
    overlay = false,
    mutation;
  doc.hasFocus = () => focused;
  doc.querySelector = () => (overlay ? {} : null);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', target());
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(fn) {
        mutation = fn;
      }
      observe() {}
      disconnect() {}
    },
  );
  const state = reactive({ recording: false }),
    source = ref('source-a');
  let generation = 2,
    sequence = 0;
  const offer = {
    version: 1,
    receiverId: uuid('a'),
    offerId: uuid('b'),
    bootId: uuid('c'),
    generation,
    active: [
      {
        command: 'player.mute',
        chord: { key: 'k', ctrl: true, alt: false, shift: true },
      },
    ],
    role: 'main',
  };
  const bridge = {
    onKeyboardShortcutReceiverState: () => () => {},
    onGlobalShortcutCommand: () => () => {},
    connectKeyboardShortcutReceiver: async () => ({ status: 'offered', offer }),
    confirmKeyboardShortcutReceiver: vi.fn(async () => ({
      status: 'ready',
      offer: { ...offer, generation: ++generation },
    })),
    admitGlobalShortcut: vi.fn(async () => ({
      status: 'admitted',
      role: focused ? 'main' : 'background',
    })),
    releaseKeyboardShortcutReceiver: vi.fn(async () => ({
      status: 'released',
    })),
  };
  const commands = {
    canExecute: () => true,
    execute: vi.fn(async () => {}),
    invalidate: vi.fn(),
    contextIdentity: () => source.value,
  };
  mounted = mount({
    setup() {
      receiver = useGlobalShortcutReceiver({
        bridge,
        commands,
        getShortcutContext: () => state,
        getRegistryRevision: () => 1,
      });
      return () => h('div');
    },
  });
  await receiver.ready;
  const packet = () => ({
    version: 1,
    receiverId: offer.receiverId,
    offerId: offer.offerId,
    bootId: offer.bootId,
    generation,
    sequence: ++sequence,
    contextRevision: receiver.contextRevision(),
    command: 'player.mute',
  });
  return {
    doc,
    state,
    source,
    bridge,
    commands,
    packet,
    focus: (value) => {
      focused = value;
    },
    overlay: (value) => {
      overlay = value;
      mutation([
        {
          type: 'childList',
          addedNodes: value ? [{ matches: () => true }] : [],
          removedNodes: value ? [] : [{ matches: () => true }],
        },
      ]);
    },
  };
}
it('yields editable/widget focus in Main and ignores stale editable focus in background', async () => {
  const f = await fixture();
  f.doc.activeElement = { tagName: 'INPUT' };
  await receiver.receive(f.packet());
  expect(f.commands.execute).not.toHaveBeenCalled();
  f.doc.activeElement = {
    tagName: 'DIV',
    getAttribute: (key) => (key === 'role' ? 'slider' : null),
  };
  await receiver.receive(f.packet());
  expect(f.commands.execute).not.toHaveBeenCalled();
  f.doc.activeElement = { tagName: 'INPUT' };
  f.focus(false);
  await receiver.receive(f.packet());
  expect(f.commands.execute).toHaveBeenCalledOnce();
});
it('does not revive an in-flight admission after overlay entry and exit', async () => {
  const f = await fixture();
  let release;
  f.bridge.admitGlobalShortcut.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = receiver.receive(f.packet());
  await setImmediate();
  f.overlay(true);
  f.overlay(false);
  release({ status: 'admitted', role: 'main' });
  await pending;
  expect(f.commands.execute).not.toHaveBeenCalled();
});
it('blocks composition and recording and removes context listeners on disposal', async () => {
  const f = await fixture();
  f.doc.listeners.get('compositionstart')();
  await setImmediate();
  await receiver.receive(f.packet());
  expect(f.commands.execute).not.toHaveBeenCalled();
  f.doc.listeners.get('compositionend')();
  f.state.recording = true;
  await setImmediate();
  await receiver.receive(f.packet());
  expect(f.commands.execute).not.toHaveBeenCalled();
  await receiver.dispose();
  expect(f.doc.listeners.size).toBe(0);
});
it('changes source admission revision without invalidating an App pending command', async () => {
  const f = await fixture(),
    before = f.packet();
  f.commands.invalidate.mockClear();
  f.source.value = 'source-b';
  await setImmediate();
  await receiver.receive(before);
  expect(f.commands.execute).not.toHaveBeenCalled();
  expect(f.commands.invalidate).not.toHaveBeenCalled();
});
