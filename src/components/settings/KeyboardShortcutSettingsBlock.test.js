import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import Component from './KeyboardShortcutSettingsBlock.vue';
import { useKeyboardShortcutSettings } from '../../composables/useKeyboardShortcutSettings.js';
import { defaultShortcutConfiguration } from '../../../shared/keyboardShortcutContract.mjs';

vi.mock('../ui/UiButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    setup:
      (p, { slots }) =>
      () =>
        h('button', { disabled: p.disabled || p.loading }, slots.default?.()),
  },
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('p', slots.default?.()),
  },
}));
vi.mock('./SettingsDocumentItem.vue', () => ({
  default: {
    props: ['title', 'value', 'guidance'],
    setup:
      (p, { slots }) =>
      () =>
        h('section', [
          h('h3', p.title),
          h('p', p.value),
          h('p', p.guidance),
          slots.actions?.(),
          slots.feedback?.(),
        ]),
  },
}));
let mounted, owner;
afterEach(() => {
  mounted?.app.unmount();
  owner?.dispose();
  mounted = null;
  owner = null;
  vi.unstubAllGlobals();
});
const button = (label) =>
  findAll(
    mounted.root,
    (n) => n.type === 'button' && n.props['aria-label'] === label,
  )[0];
const event = (key, extra = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...extra,
});
async function setup(
  reply = {
    status: 'ready',
    revision: null,
    configuration: defaultShortcutConfiguration(),
  },
) {
  let sequence = 1;
  const bridge = {
    getKeyboardShortcuts: vi.fn().mockResolvedValue(reply),
    setKeyboardShortcuts: vi.fn(async (input) => ({
      status: 'ready',
      revision: (sequence++).toString(16).padStart(64, '0'),
      configuration: input.configuration,
    })),
  };
  vi.stubGlobal('window', {
    Utawakui: bridge,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  attachClientRender(
    Component,
    './KeyboardShortcutSettingsBlock.vue',
    import.meta.url,
  );
  mounted = mount(Component);
  owner = useKeyboardShortcutSettings({ bridge });
  await owner.initialize();
  await nextTick();
  trigger(button('展開 App 快捷鍵'), 'onClick');
  await nextTick();
  return bridge;
}
describe('App shortcut settings document', () => {
  it('keeps seven commands inside the existing inline Settings surface with default assignments', async () => {
    await setup();
    expect(
      findAll(mounted.root, (n) => n.props?.['data-shortcut-command']),
    ).toHaveLength(7);
    expect(textContent(mounted.root)).toContain('Ctrl + ↑');
    expect(textContent(mounted.root)).toContain('未設定');
    expect(textContent(mounted.root)).toContain('全域快捷鍵尚未開放');
    expect(
      findAll(mounted.root, (n) => n.props?.role === 'dialog'),
    ).toHaveLength(0);
  });
  it('requires Apply after recording a complete candidate and activates only its confirmed save', async () => {
    const bridge = await setup();
    trigger(button('設定下一首快捷鍵'), 'onClick');
    await nextTick();
    expect(owner.isRecording.value).toBe(true);
    trigger(
      button('錄製下一首快捷鍵'),
      'onKeydown',
      event('j', { ctrlKey: true }),
    );
    await nextTick();
    expect(bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
    trigger(button('套用下一首快捷鍵'), 'onClick');
    await vi.waitFor(() =>
      expect(owner.configuration.value.bindings[2].app.mode).toBe('custom'),
    );
    await nextTick();
    expect(textContent(mounted.root)).toContain('Ctrl + J');
    expect(owner.isRecording.value).toBe(false);
  });
  it('cancels partial recording without a save, and offers clickable disable and default restoration', async () => {
    const bridge = await setup();
    trigger(button('設定下一首快捷鍵'), 'onClick');
    await nextTick();
    trigger(
      button('錄製下一首快捷鍵'),
      'onKeydown',
      event('Control', { ctrlKey: true }),
    );
    trigger(button('取消下一首快捷鍵'), 'onClick');
    await nextTick();
    expect(bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
    expect(owner.isRecording.value).toBe(false);
    trigger(button('停用移調 +1快捷鍵'), 'onClick');
    await vi.waitFor(() =>
      expect(owner.configuration.value.bindings[3].app.mode).toBe('disabled'),
    );
    await nextTick();
    trigger(button('恢復全部快捷鍵預設'), 'onClick');
    await vi.waitFor(() => expect(owner.isDefault.value).toBe(true));
  });
  it('shows preserved-file read errors with retry and no active-looking assignment', async () => {
    const bridge = await setup({ status: 'invalid' });
    expect(textContent(mounted.root)).toContain('原檔已保留');
    expect(textContent(mounted.root)).toContain('尚未讀取');
    expect(button('設定下一首快捷鍵').props.disabled).toBe(true);
    bridge.getKeyboardShortcuts.mockResolvedValue({
      status: 'ready',
      revision: null,
      configuration: defaultShortcutConfiguration(),
    });
    trigger(button('重新讀取快捷鍵'), 'onClick');
    await vi.waitFor(() => expect(owner.state.loaded).toBe(true));
  });
});
