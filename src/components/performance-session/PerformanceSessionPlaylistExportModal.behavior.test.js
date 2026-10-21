import { h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Modal from './PerformanceSessionPlaylistExportModal.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import { useAppNotifications } from '../../composables/useAppNotifications.js';
const notifications = useAppNotifications();
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
const fixture = vi.hoisted(() => ({
  refresh: vi.fn(async () => {}),
  select: null,
}));
vi.mock('../../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({ refresh: fixture.refresh }),
}));
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    props: ['open', 'title', 'closeDisabled'],
    setup(props, { slots }) {
      return () =>
        props.open
          ? h('section', { 'data-locked': props.closeDisabled }, [
              slots.default?.(),
              slots.footer?.(),
            ])
          : null;
    },
  },
}));
vi.mock('../ui/UiTextField.vue', () => ({
  default: {
    props: ['id', 'modelValue'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          id: props.id,
          value: props.modelValue,
          onInput: (event) => emit('update:modelValue', event.target.value),
        });
    },
  },
}));
vi.mock('../ui/UiSelect.vue', () => ({
  default: {
    props: ['modelValue'],
    setup(props, { emit }) {
      fixture.select = { props, emit };
      return () => h('select');
    },
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    setup(_, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.());
    },
  },
}));
attachClientRender(
  Modal,
  './PerformanceSessionPlaylistExportModal.vue',
  import.meta.url,
);
attachClientRender(UiHint, '../ui/UiHint.vue', import.meta.url);
attachClientRender(UiNotice, '../ui/UiNotice.vue', import.meta.url);
const preview = {
  sessionId: 'show',
  scope: 'completed',
  token: 'trusted',
  total: 4,
  savedCount: 1,
  mergedCount: 1,
  manualCount: 1,
  unavailableCount: 1,
};
const settle = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};
const saveButton = (root) =>
  findAll(root, (n) => n.type === 'button' && textContent(n) === '另存歌單')[0];
afterEach(() => {
  for (const item of notifications.items.value) notifications.clear(item.key);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
beforeEach(() =>
  vi.stubGlobal('window', {
    Utawakui: {
      previewPerformancePlaylist: vi.fn(async () => ({
        ok: true,
        plan: preview,
      })),
      savePerformancePlaylist: vi.fn(async () => ({
        ok: true,
        plan: { playlistId: 'saved' },
      })),
    },
  }),
);
describe('save performance playlist confirmation', () => {
  it('keeps a failed write in its dialog, then announces one successful retry even if list refresh fails', async () => {
    const close = vi.fn();
    window.Utawakui.savePerformancePlaylist.mockRejectedValueOnce(
      new Error('E:/private/playlist.json'),
    );
    const view = mount(Modal, {
      open: true,
      sessionId: 'show',
      onClose: close,
    });
    await settle();
    trigger(saveButton(view.root), 'onClick');
    await settle();
    expect(textContent(view.root)).toContain('歌單尚未保存');
    expect(textContent(view.root)).not.toContain('private');
    expect(close).not.toHaveBeenCalled();
    expect(notifications.items.value).toHaveLength(0);
    fixture.refresh.mockRejectedValueOnce(new Error('read failed after save'));
    trigger(saveButton(view.root), 'onClick');
    await settle();
    expect(close).toHaveBeenCalledOnce();
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0].title).toBe('演出歌單已保存');
    view.app.unmount();
  });

  it('guards repeated clicks during a save and waits for its terminal response', async () => {
    let finish;
    window.Utawakui.savePerformancePlaylist.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = mount(Modal, { open: true, sessionId: 'show' });
    await settle();
    const button = saveButton(view.root);
    trigger(button, 'onClick');
    trigger(button, 'onClick');
    expect(window.Utawakui.savePerformancePlaylist).toHaveBeenCalledOnce();
    expect(notifications.items.value).toHaveLength(0);
    finish({ ok: true, plan: { playlistId: 'saved' } });
    await settle();
    expect(notifications.items.value).toHaveLength(1);
    view.app.unmount();
  });

  it('does not announce an invalid success response', async () => {
    window.Utawakui.savePerformancePlaylist.mockResolvedValue({ ok: true });
    const close = vi.fn();
    const view = mount(Modal, {
      open: true,
      sessionId: 'show',
      onClose: close,
    });
    await settle();
    trigger(saveButton(view.root), 'onClick');
    await settle();
    expect(notifications.items.value).toHaveLength(0);
    expect(close).not.toHaveBeenCalled();
    expect(textContent(view.root)).toContain('歌單尚未保存');
    view.app.unmount();
  });

  it('shows actual merge, manual and unavailable exclusions before saving one populated playlist', async () => {
    const close = vi.fn(),
      saved = vi.fn();
    const view = mount(Modal, {
      open: true,
      sessionId: 'show',
      suggestedName: 'My show',
      onClose: close,
      onSaved: saved,
    });
    await settle();
    const text = textContent(view.root);
    expect(text).toContain('合併 1 項');
    expect(text).toContain('手動項目 1 項');
    expect(text).toContain('失連項目 1 項');
    expect(window.Utawakui.savePerformancePlaylist).not.toHaveBeenCalled();
    trigger(saveButton(view.root), 'onClick');
    await settle();
    expect(window.Utawakui.savePerformancePlaylist).toHaveBeenCalledWith({
      sessionId: 'show',
      scope: 'completed',
      token: 'trusted',
      name: 'My show',
    });
    expect(saved).toHaveBeenCalledWith('saved');
    expect(close).toHaveBeenCalledOnce();
    expect(notifications.items.value).toHaveLength(1);
    expect(notifications.items.value[0]).toMatchObject({
      title: '演出歌單已保存',
      tone: 'success',
      lifecycle: 'transient',
    });
    view.app.unmount();
  });
  it('blocks saving an obsolete preview during a scope change and requires a fresh preview after main rejects a stale token', async () => {
    let resolve;
    window.Utawakui.previewPerformancePlaylist
      .mockResolvedValueOnce({ ok: true, plan: preview })
      .mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
    window.Utawakui.savePerformancePlaylist.mockResolvedValue({
      ok: false,
      error: { message: '請重新檢視' },
    });
    const props = reactive({ open: true, sessionId: 'show' });
    const view = mount(Modal, props);
    await settle();
    fixture.select.emit('update:modelValue', 'all');
    await nextTick();
    expect(saveButton(view.root).props.disabled).toBe(true);
    resolve({ ok: true, plan: { ...preview, scope: 'all', token: 'fresh' } });
    await settle();
    trigger(saveButton(view.root), 'onClick');
    await settle();
    expect(textContent(view.root)).toContain('請重新檢視');
    expect(notifications.items.value).toHaveLength(0);
    expect(saveButton(view.root).props.disabled).toBe(true);
    view.app.unmount();
  });
  it('does not allow empty exports and keeps the original session when preview fails', async () => {
    window.Utawakui.previewPerformancePlaylist.mockResolvedValueOnce({
      ok: true,
      plan: { ...preview, savedCount: 0 },
    });
    const view = mount(Modal, { open: true, sessionId: 'show' });
    await settle();
    expect(saveButton(view.root).props.disabled).toBe(true);
    expect(textContent(view.root)).toContain('沒有可保存');
    expect(window.Utawakui.savePerformancePlaylist).not.toHaveBeenCalled();
    view.app.unmount();
  });
});
