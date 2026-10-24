import { createSSRApp, h, shallowRef, nextTick, reactive } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { owner } = vi.hoisted(() => ({ owner: {} }));
vi.mock('../../composables/useLyrics.js', () => ({
  useLyrics: () => ({ experimentalLyrics: owner }),
}));
import Component from './LyricsExperimentalEstimate.vue';
import UiButton from '../ui/UiButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, file] of [
  [Component, './LyricsExperimentalEstimate.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, file, import.meta.url);
let app;
afterEach(() => app?.unmount());
beforeEach(() => {
  Object.assign(owner, {
    needsReanalysis: shallowRef(false),
    applied: shallowRef(false),
    estimate: shallowRef({ status: 'ready' }),
    prepared: shallowRef({
      status: 'ready',
      lines: [{ status: 'ready', fineTiming: { units: [{}] } }],
    }),
    setApplied: vi.fn((value) => {
      owner.applied.value = value;
    }),
  });
});
describe('compact experimental estimate provenance', () => {
  it('renders only one button and toggles the existing owner explicitly', async () => {
    const mounted = mount(Component);
    app = mounted.app;
    const button = () => findAll(mounted.root, (n) => n.type === 'button')[0];
    expect(findAll(mounted.root, (n) => n.type === 'button')).toHaveLength(1);
    expect(textContent(mounted.root).trim()).toBe('分析顯示');
    expect(button().props['aria-pressed']).toBe(false);
    expect(button().props['aria-description']).toContain('開啟分析顯示');
    expect(button().props['aria-description']).toContain(
      '已產生的歌詞時間提示',
    );
    expect(button().props['aria-description']).toContain('實驗');
    expect(button().props['aria-description']).toContain('1 句有分段時間');
    expect(owner.setApplied).not.toHaveBeenCalled();
    trigger(button(), 'onClick');
    await nextTick();
    expect(owner.setApplied).toHaveBeenLastCalledWith(true);
    expect(button().props['aria-pressed']).toBe(true);
    expect(textContent(button()).trim()).toBe('分析顯示');
    expect(button().props['aria-description']).toContain('關閉分析顯示');
    expect(button().props['aria-description']).toContain('恢復原歌詞時間');
    trigger(button(), 'onClick');
    await nextTick();
    expect(owner.setApplied).toHaveBeenLastCalledWith(false);
    expect(button().props['aria-pressed']).toBe(false);
    expect(textContent(button()).trim()).toBe('分析顯示');
  });
  it.each([
    ['unavailable', false, '分析目前不可用'],
    ['stale', true, '校時已變更'],
  ])(
    'keeps %s reasons accessible without allowing activation',
    (status, stale, reason) => {
      owner.estimate.value = { status };
      owner.prepared.value = { status };
      owner.needsReanalysis.value = stale;
      const mounted = mount(Component);
      app = mounted.app;
      const button = findAll(mounted.root, (n) => n.type === 'button')[0];
      expect(textContent(mounted.root).trim()).toBe('分析顯示');
      expect(button.props['aria-disabled']).toBe(true);
      expect(button.props.disabled).toBe(false);
      expect(button.props['aria-description']).toContain(reason);
      trigger(button, 'onClick');
      expect(owner.setApplied).not.toHaveBeenCalled();
    },
  );
  it('retains the authoring lock through parent updates', async () => {
    const props = reactive({ disabled: true });
    const mounted = mount(Component, props);
    app = mounted.app;
    const button = () => findAll(mounted.root, (n) => n.type === 'button')[0];
    expect(button().props['aria-description']).toContain('結束編輯');
    trigger(button(), 'onClick');
    expect(owner.setApplied).not.toHaveBeenCalled();
    props.disabled = false;
    await nextTick();
    trigger(button(), 'onClick');
    expect(owner.setApplied).toHaveBeenCalledWith(true);
  });
  it.each(['missing', 'disabled'])(
    'omits the action when analysis is %s',
    async (status) => {
      owner.estimate.value = { status };
      const html = await renderToString(createSSRApp(Component));
      expect(html).not.toContain('<button');
    },
  );
  it('identifies read-only reuse without automatically applying it', async () => {
    Object.assign(owner, {
      needsReanalysis: shallowRef(false),
      applied: shallowRef(false),
      estimate: shallowRef({
        status: 'ready',
        compatibility: { rule: 'normalizer-v2-v3-exact-v1' },
      }),
      prepared: shallowRef({
        status: 'ready',
        lines: [{ status: 'ready', fineTiming: { units: [{}] } }],
      }),
      setApplied: vi.fn(),
    });
    const html = await renderToString(
      createSSRApp({ render: () => h(Component) }),
    );
    expect(html).toContain('沿用既有分析，時間未變');
    expect(html).toContain('開啟分析顯示');
    expect(html).toContain('分析顯示');
    expect(owner.setApplied).not.toHaveBeenCalled();
  });
});
