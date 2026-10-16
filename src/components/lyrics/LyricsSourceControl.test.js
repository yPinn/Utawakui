import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, nextTick, reactive } from 'vue';
import { renderToString } from '@vue/server-renderer';
import LyricsSourceControl from './LyricsSourceControl.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiField from '../ui/UiField.vue';
import UiButton from '../ui/UiButton.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, path] of [
  [LyricsSourceControl, './LyricsSourceControl.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiButton, '../ui/UiButton.vue'],
])
  attachClientRender(component, path, import.meta.url);

let app;
afterEach(() => app?.unmount());
function setup(overrides = {}) {
  const props = reactive({
    sources: [{ filename: 'one.lrc' }, { filename: 'two.lrc' }],
    selectedSourceFilename: 'one.lrc',
    hasSelectedTrack: true,
    isLoading: false,
    onSourceChange: vi.fn(),
    onManageSources: vi.fn(),
    ...overrides,
  });
  const mounted = mount(LyricsSourceControl, props);
  app = mounted.app;
  const select = () => findAll(mounted.root, (n) => n.type === 'select')[0];
  const button = () => findAll(mounted.root, (n) => n.type === 'button')[0];
  return { ...mounted, props, select, button };
}

describe('shared lyrics source entry', () => {
  it('renders labelled controls with or without sources using the production template', async () => {
    for (const sources of [[], [{ filename: 'one.lrc' }]]) {
      const html = await renderToString(
        createSSRApp(LyricsSourceControl, {
          sources,
          hasSelectedTrack: true,
        }),
      );
      expect(html).toContain('歌詞來源');
      expect(html).toContain('管理來源');
    }
  });
  it('switches a saved source through the canonical parent action', () => {
    const { props, select } = setup();
    expect(select().props.value).toBe('one.lrc');
    trigger(select(), 'onChange', { target: { value: 'two.lrc' } });
    expect(props.onSourceChange).toHaveBeenCalledWith('two.lrc');
  });

  it('does not lock a single source and opens management without navigation', () => {
    const { props, select, button } = setup({
      sources: [{ filename: 'one.lrc' }],
    });
    expect(select().props.disabled).toBe(false);
    expect(textContent(button())).toContain('管理來源');
    trigger(button(), 'onClick');
    expect(props.onManageSources).toHaveBeenCalledOnce();
  });

  it('keeps management available when the selected track has no sources', () => {
    const { select, button, root } = setup({
      sources: [],
      selectedSourceFilename: '',
    });
    expect(select().props.disabled).toBe(true);
    expect(button().props.disabled).toBe(false);
    expect(textContent(root)).toContain('尚無歌詞來源');
  });

  it('disables selection while loading and both controls without a track', async () => {
    const { props, select, button } = setup({ isLoading: true });
    expect(select().props.disabled).toBe(true);
    props.isLoading = false;
    props.hasSelectedTrack = false;
    await nextTick();
    expect(select().props.disabled).toBe(true);
    expect(button().props.disabled).toBe(true);
  });

  it('reuses field/button styling rather than implementing native control CSS', () => {
    const source = readFileSync(
      new URL('./LyricsSourceControl.vue', import.meta.url),
      'utf8',
    );
    expect(source).toContain('<UiSelect');
    expect(source).toContain('<UiButton');
    expect(source).not.toContain('<select');
    expect(source).not.toMatch(/(?:font-size|background|border-radius|color):/);
    expect(source).toContain('var(--ui-space-2)');
  });
});
