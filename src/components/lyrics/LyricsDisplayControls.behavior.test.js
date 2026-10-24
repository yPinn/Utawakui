import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp, reactive, nextTick, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import LyricsDisplayControls from './LyricsDisplayControls.vue';
import LyricsSourceControl from './LyricsSourceControl.vue';
import LyricsPreparationBar from './LyricsPreparationBar.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import UiField from '../ui/UiField.vue';
import UiButton from '../ui/UiButton.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiHint from '../ui/UiHint.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, file] of [
  [LyricsDisplayControls, './LyricsDisplayControls.vue'],
  [LyricsPreparationBar, './LyricsPreparationBar.vue'],
  [LyricsSourceControl, './LyricsSourceControl.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiCombobox, '../ui/UiCombobox.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiSegmentedControl, '../ui/UiSegmentedControl.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiButtonGroup, '../ui/UiButtonGroup.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
  [UiScrollLayout, '../ui/UiScrollLayout.vue'],
  [UiNotice, '../ui/UiNotice.vue'],
  [UiHint, '../ui/UiHint.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, file, import.meta.url);
let app;
afterEach(() => app?.unmount());
const items = [
  { id: 'off', label: '關閉' },
  { id: 'furigana', label: '假名' },
  { id: 'romaji', label: '羅馬字' },
];
describe('shared display control interactions', () => {
  it.each([LyricsDisplayControls, LyricsPreparationBar])(
    'places an optional action after font controls, outside the font group',
    (component) => {
      const action = vi.fn();
      const mounted = mount(
        component,
        { canIncreaseFontSize: true },
        {
          'font-actions': () => h('button', { onClick: action }, '分析顯示'),
        },
      );
      app = mounted.app;
      const buttons = findAll(mounted.root, (n) => n.type === 'button');
      const analysis = buttons.find(
        (n) => textContent(n).trim() === '分析顯示',
      );
      expect(analysis).toBeDefined();
      expect(buttons.indexOf(analysis)).toBeGreaterThan(
        buttons.findIndex((n) => textContent(n).trim() === '放大歌詞'),
      );
      const fontGroup = findAll(
        mounted.root,
        (n) => n.props['aria-label'] === '歌詞字級',
      )[0];
      expect(fontGroup.contains(analysis)).toBe(false);
      trigger(analysis, 'onClick');
      expect(action).toHaveBeenCalledOnce();
    },
  );
  it('keeps source, text, reading and font controls in workflow order', () => {
    const { root, app: mountedApp } = mount(LyricsDisplayControls, {
      hasSelectedTrack: true,
      sources: [{ filename: 'a.lrc' }],
      showsLyricsTextVariant: true,
      readingOptions: items,
      canDecreaseFontSize: true,
      canIncreaseFontSize: true,
    });
    app = mountedApp;
    const controls = findAll(root, (node) =>
      [
        '歌詞來源',
        '管理歌詞來源',
        '歌詞文字顯示',
        '歌詞讀音顯示',
        '歌詞字級',
      ].includes(node.props['aria-label']),
    );
    expect(controls.map((node) => node.props['aria-label'])).toEqual([
      '歌詞來源',
      '管理歌詞來源',
      '歌詞文字顯示',
      '歌詞讀音顯示',
      '歌詞字級',
    ]);
    expect(
      findAll(root, (node) => node.props.class?.includes?.('ui-button-group')),
    ).toHaveLength(1);
  });
  it('emits selection and same-option retry through one reading control', async () => {
    const select = vi.fn();
    const props = reactive({
      readingOptions: items,
      readingVariant: 'off',
      hasSelectedTrack: true,
      onReadingVariantChange: select,
    });
    const mounted = mount(LyricsDisplayControls, props);
    app = mounted.app;
    const option = () =>
      findAll(
        mounted.root,
        (n) => n.type === 'button' && textContent(n).trim() === '假名',
      )[0];
    trigger(option(), 'onClick');
    props.readingVariant = 'furigana';
    await nextTick();
    trigger(option(), 'onClick');
    expect(select.mock.calls).toEqual([['furigana'], ['furigana']]);
  });
  it('routes text, source, management and font intents without owning state', () => {
    const handlers = Object.fromEntries(
      [
        'SourceChange',
        'ManageSources',
        'LyricsTextVariantChange',
        'DecreaseFontSize',
        'IncreaseFontSize',
      ].map((name) => [`on${name}`, vi.fn()]),
    );
    const mounted = mount(LyricsDisplayControls, {
      ...handlers,
      hasSelectedTrack: true,
      sources: [{ filename: 'a.lrc' }],
      showsLyricsTextVariant: true,
      canDecreaseFontSize: true,
      canIncreaseFontSize: true,
    });
    app = mounted.app;
    const control = (label) =>
      findAll(
        mounted.root,
        (n) =>
          n.props['aria-label'] === label ||
          (n.type === 'button' && textContent(n).trim() === label),
      )[0];
    for (const key of ['ArrowDown', 'End', 'Enter']) {
      trigger(control('歌詞來源'), 'onKeydown', {
        key,
        preventDefault: vi.fn(),
      });
    }
    trigger(control('管理歌詞來源'), 'onClick');
    trigger(control('歌詞文字顯示'), 'onChange', {
      target: { value: 'original' },
    });
    trigger(control('縮小歌詞'), 'onClick');
    trigger(control('放大歌詞'), 'onClick');
    expect(handlers.onSourceChange).toHaveBeenCalledWith('a.lrc');
    expect(handlers.onLyricsTextVariantChange).toHaveBeenCalledWith('original');
    for (const name of [
      'ManageSources',
      'DecreaseFontSize',
      'IncreaseFontSize',
    ])
      expect(handlers[`on${name}`]).toHaveBeenCalledOnce();
  });
  it.each([
    [{ isPreparingReading: true }, '正在讀取讀音'],
    [{ isGeneratingReading: true }, '正在產生讀音'],
    [{ readingError: '讀取失敗' }, '讀取失敗'],
    [{ readingVariant: 'off', readingError: '不應顯示的錯誤' }, ''],
    [{ readingOptions: [] }, ''],
  ])(
    'renders bounded status and hidden states through shared primitives: %j',
    async (extra, message) => {
      const html = await renderToString(
        createSSRApp(LyricsDisplayControls, {
          hasSelectedTrack: true,
          readingOptions: items,
          readingVariant: 'romaji',
          ...extra,
        }),
      );
      if (message) expect(html).toContain(message);
      else expect(html).not.toContain('不應顯示的錯誤');
      expect(html).not.toContain('產生讀音</button>');
    },
  );
  it('disables reading options while lyrics are loading', () => {
    const mounted = mount(LyricsDisplayControls, {
      readingOptions: items,
      hasSelectedTrack: true,
      isLoadingSources: true,
    });
    app = mounted.app;
    const options = findAll(mounted.root, (n) => n.props.role === 'radio');
    expect(options).toHaveLength(3);
    expect(options.every((n) => n.props.disabled)).toBe(true);
  });
});
