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
import Reference from './KeyboardShortcutReference.vue';
import Keys from './KeyboardShortcutKeys.vue';
import Disclosure from '../ui/UiDisclosure.vue';
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
vi.mock('../ui/UiKbd.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('kbd', slots.default?.()),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'disabled'],
    setup: (p) => () =>
      h('button', { 'aria-label': p.label, disabled: p.disabled }, '更多'),
  },
}));
vi.mock('../ui/UiTabs.vue', () => ({
  default: {
    props: ['items', 'activeId'],
    emits: ['update:activeId'],
    setup:
      (p, { emit }) =>
      () =>
        h(
          'div',
          { role: 'tablist' },
          p.items.map((item) =>
            h(
              'button',
              {
                role: 'tab',
                'aria-selected': item.id === p.activeId,
                disabled: item.disabled,
                onClick: () => emit('update:activeId', item.id),
              },
              item.label,
            ),
          ),
        ),
  },
}));
vi.mock('../ui/UiActionMenu.vue', () => ({
  default: {
    props: ['open', 'content'],
    emits: ['select', 'close'],
    setup:
      (p, { emit }) =>
      () =>
        p.open
          ? h(
              'div',
              { role: 'menu' },
              p.content.groups.flatMap((group) =>
                group.items.map((item) =>
                  h(
                    'button',
                    {
                      disabled: item.disabled,
                      'aria-label': item.label,
                      onClick: () => emit('select', item.value),
                    },
                    item.label,
                  ),
                ),
              ),
            )
          : null,
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
  attachClientRender(
    Reference,
    './KeyboardShortcutReference.vue',
    import.meta.url,
  );
  attachClientRender(Keys, './KeyboardShortcutKeys.vue', import.meta.url);
  attachClientRender(Disclosure, '../ui/UiDisclosure.vue', import.meta.url);
  mounted = mount(Component);
  owner = useKeyboardShortcutSettings({ bridge });
  await owner.initialize();
  await nextTick();
  trigger(button('展開快捷鍵設定'), 'onClick');
  await nextTick();
  return bridge;
}
async function tab(label) {
  trigger(
    findAll(
      mounted.root,
      (n) => n.props?.role === 'tab' && textContent(n) === label,
    )[0],
    'onClick',
  );
  await nextTick();
}
describe('App shortcut settings document', () => {
  it('orders four categories with 3/5/2 editable rows and a read-only reference, without assigning Space', async () => {
    await setup();
    expect(
      findAll(mounted.root, (n) => n.props?.['data-shortcut-command']),
    ).toHaveLength(3);
    expect(
      findAll(mounted.root, (n) => n.props?.role === 'tab').map(textContent),
    ).toEqual(['播放控制', '音訊調整', '歌詞對時', '操作說明']);
    expect(textContent(mounted.root)).toContain('未設定');
    await tab('音訊調整');
    expect(
      findAll(mounted.root, (n) => n.props?.['data-shortcut-command']).map(
        (n) => n.props['data-shortcut-command'],
      ),
    ).toEqual([
      'player.volume-up',
      'player.volume-down',
      'player.mute',
      'player.transpose-up',
      'player.transpose-down',
    ]);
    expect(
      findAll(mounted.root, (n) => n.type === 'kbd').length,
    ).toBeGreaterThan(0);
    await tab('歌詞對時');
    expect(
      findAll(mounted.root, (n) => n.props?.['data-shortcut-command']),
    ).toHaveLength(2);
    expect(textContent(mounted.root)).toContain('會自動儲存');
    await tab('操作說明');
    expect(
      findAll(mounted.root, (n) => n.props?.['data-shortcut-command']),
    ).toHaveLength(0);
    expect(textContent(mounted.root)).toContain('鍵盤媒體鍵');
    expect(textContent(mounted.root)).toContain(
      '切到其他程式後，自訂快捷鍵不會生效',
    );
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
    expect(
      findAll(
        findAll(
          mounted.root,
          (n) => n.props?.['data-shortcut-command'] === 'player.next',
        )[0],
        (n) => n.type === 'kbd',
      ).map(textContent),
    ).toEqual(['Ctrl', 'J']);
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
    await tab('音訊調整');
    trigger(button('歌曲音量 +10%選項'), 'onClick');
    await nextTick();
    expect(button('停用歌曲音量 +10%快捷鍵')).toBeTruthy();
    trigger(button('停用歌曲音量 +10%快捷鍵'), 'onClick');
    await vi.waitFor(() =>
      expect(
        owner.configuration.value.bindings.find(
          (b) => b.command === 'player.volume-up',
        ).app.mode,
      ).toBe('disabled'),
    );
    trigger(button('升調 1 半音選項'), 'onClick');
    await nextTick();
    trigger(button('停用升調 1 半音快捷鍵'), 'onClick');
    await vi.waitFor(() =>
      expect(owner.configuration.value.bindings[3].app.mode).toBe('disabled'),
    );
    await nextTick();
    trigger(button('恢復全部快捷鍵預設'), 'onClick');
    await vi.waitFor(() => expect(owner.isDefault.value).toBe(true));
  });
  it('cancels an unapplied candidate on a category change without saving or stealing focus back', async () => {
    const bridge = await setup();
    trigger(button('設定下一首快捷鍵'), 'onClick');
    await nextTick();
    trigger(
      button('錄製下一首快捷鍵'),
      'onKeydown',
      event('j', { ctrlKey: true }),
    );
    await nextTick();
    expect(owner.isRecording.value).toBe(true);
    await tab('音訊調整');
    expect(owner.isRecording.value).toBe(false);
    expect(bridge.setKeyboardShortcuts).not.toHaveBeenCalled();
    await tab('播放控制');
    expect(button('錄製下一首快捷鍵')).toBeUndefined();
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
  it('offers reload beside a failed row save after cancelling its candidate', async () => {
    const bridge = await setup();
    bridge.setKeyboardShortcuts.mockResolvedValue({ status: 'unavailable' });
    trigger(button('設定下一首快捷鍵'), 'onClick');
    await nextTick();
    trigger(
      button('錄製下一首快捷鍵'),
      'onKeydown',
      event('j', { ctrlKey: true }),
    );
    await nextTick();
    trigger(button('套用下一首快捷鍵'), 'onClick');
    await vi.waitFor(() => expect(owner.state.saveError).toContain('重新讀取'));
    await nextTick();
    expect(button('重新讀取快捷鍵').props.disabled).toBe(true);
    trigger(button('取消下一首快捷鍵'), 'onClick');
    await nextTick();
    expect(button('重新讀取快捷鍵').props.disabled).toBe(false);
    trigger(button('重新讀取快捷鍵'), 'onClick');
    await vi.waitFor(() => expect(owner.state.saveError).toBe(''));
    expect(bridge.getKeyboardShortcuts).toHaveBeenCalledTimes(2);
    expect(owner.configuration.value.bindings[2].app.mode).toBe('default');
  });
});
