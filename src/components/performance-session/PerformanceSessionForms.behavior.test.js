import { nextTick, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import Editor from './PerformanceSessionPlanEditor.vue';
import Manual from './PerformanceSessionManualItemForm.vue';
import Pane from './PerformanceSessionReviewPane.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiField from '../ui/UiField.vue';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiHint from '../ui/UiHint.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';

for (const [component, path] of [
  [Editor, './PerformanceSessionPlanEditor.vue'],
  [Manual, './PerformanceSessionManualItemForm.vue'],
  [Pane, './PerformanceSessionReviewPane.vue'],
  [UiScrollLayout, '../ui/UiScrollLayout.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiTextField, '../ui/UiTextField.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, path, import.meta.url);

let mounted;
beforeEach(() => {
  const body = hostNode('body');
  vi.stubGlobal('document', {
    body,
    activeElement: hostNode('button'),
    documentElement: hostNode('html'),
    querySelector: () => null,
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 850,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: (cb) => cb(),
    cancelAnimationFrame: vi.fn(),
  });
});
afterEach(() => {
  mounted?.app.unmount();
  mounted = null;
  vi.unstubAllGlobals();
});
const button = (text) =>
  findAll(
    mounted.root,
    (n) => n.type === 'button' && textContent(n).trim() === text,
  )[0];
const input = (id) => findAll(mounted.root, (n) => n.props.id === id)[0];
async function type(id, value) {
  trigger(input(id), 'onInput', { target: { value } });
  await nextTick();
}
const readyItem = {
  itemId: 'occurrence-1',
  trackId: 'track-1',
  mode: 'library-track',
  status: 'ready',
  displayTitle: '本場曲名',
  displayArtist: '本場第二行',
  linkedTrack: { title: '曲庫原名', artist: '曲庫藝人' },
};

describe('Performance Session forms preserve product intents', () => {
  it('keeps canonical metadata read-only and saves only session display fields', async () => {
    const onSaveDisplay = vi.fn();
    mounted = mount(Editor, { item: readyItem, onSaveDisplay });
    expect(textContent(mounted.root)).toContain('曲庫原名');
    expect(findAll(mounted.root, (n) => n.type === 'input')).toHaveLength(0);
    trigger(button('調整顯示名稱'), 'onClick');
    await nextTick();
    await type('performance-session-display-title', '修正本場曲名');
    trigger(button('儲存顯示名稱'), 'onClick');
    expect(onSaveDisplay).toHaveBeenCalledWith({
      displayTitle: '修正本場曲名',
      displayArtist: '本場第二行',
    });
    expect(readyItem.linkedTrack.title).toBe('曲庫原名');
  });

  it('cancels edits and resets draft fields when the occurrence changes', async () => {
    const props = reactive({ item: { ...readyItem } });
    mounted = mount(Editor, props);
    trigger(button('調整顯示名稱'), 'onClick');
    await nextTick();
    await type('performance-session-display-title', 'Unsaved');
    trigger(button('取消'), 'onClick');
    await nextTick();
    trigger(button('調整顯示名稱'), 'onClick');
    await nextTick();
    expect(input('performance-session-display-title').props.value).toBe(
      '本場曲名',
    );
    props.item = {
      ...readyItem,
      itemId: 'occurrence-2',
      displayTitle: '下一首',
    };
    await nextTick();
    expect(button('調整顯示名稱')).toBeTruthy();
    expect(textContent(mounted.root)).not.toContain('Unsaved');
  });

  it('requires a recovery track and emits a bounded relink intent', async () => {
    const onRelink = vi.fn();
    mounted = mount(Editor, {
      item: {
        ...readyItem,
        mode: 'placeholder',
        status: 'needs-link',
        trackId: null,
      },
      tracks: [{ id: 'track-2', title: 'Recovery' }],
      onRelink,
    });
    expect(button('連結既有歌曲').props.disabled).toBe(true);
    trigger(input('performance-session-track-link'), 'onChange', {
      target: { value: 'track-2' },
    });
    await nextTick();
    trigger(button('連結既有歌曲'), 'onClick');
    expect(onRelink).toHaveBeenCalledWith({
      displayTitle: '本場曲名',
      displayArtist: '本場第二行',
      trackId: 'track-2',
    });
  });

  it('keeps manual create/cancel and saving-disabled actions', async () => {
    const onCreate = vi.fn(),
      onCancel = vi.fn();
    const props = reactive({ saving: false, onCreate, onCancel });
    mounted = mount(Manual, props);
    expect(button('加入待播').props.disabled).toBe(true);
    await type('performance-session-manual-display-title', '外部伴奏');
    await type('performance-session-manual-display-artist', '版本資訊');
    trigger(button('加入待播'), 'onClick');
    expect(onCreate).toHaveBeenCalledWith({
      displayTitle: '外部伴奏',
      displayArtist: '版本資訊',
    });
    trigger(button('取消'), 'onClick');
    expect(onCancel).toHaveBeenCalledOnce();
    props.saving = true;
    await nextTick();
    expect(button('加入待播').props.disabled).toBe(true);
    expect(button('取消').props.disabled).toBe(true);
  });
});
