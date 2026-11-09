import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import ObsColorSwatchRail from './ObsColorSwatchRail.vue';
import ObsOutputColorPalette from './ObsOutputColorPalette.vue';
import UiButton from '../ui/UiButton.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  ObsOutputColorPalette,
  './ObsOutputColorPalette.vue',
  import.meta.url,
);
attachClientRender(
  ObsColorSwatchRail,
  './ObsColorSwatchRail.vue',
  import.meta.url,
);
attachClientRender(UiButton, '../ui/UiButton.vue', import.meta.url);
attachClientRender(UiTooltip, '../ui/UiTooltip.vue', import.meta.url);
attachClientRender(
  UiTooltipSurface,
  '../ui/tooltip/UiTooltipSurface.vue',
  import.meta.url,
);

describe('ObsOutputColorPalette', () => {
  it('labels the current target above the saved and recent shelves', () => {
    const { app, root } = mount(ObsOutputColorPalette, {
      label: '文字色',
      modelValue: '#ffffff',
      savedColors: ['#112233', '#445566'],
      recentColors: ['#778899', '#aabbcc'],
    });

    const shelf = findAll(
      root,
      (node) => node.props?.['aria-label'] === 'Output 色票',
    )[0];
    const savedRail = findAll(
      shelf,
      (node) => node.props?.['aria-label'] === 'Output 常用色票',
    )[0];

    expect(textContent(shelf)).toContain('套用至：文字色');
    expect(textContent(savedRail)).toContain('常用');
    expect(
      findAll(shelf, (node) => node.props?.['data-color-source']).map(
        (node) => node.props['data-color-source'],
      ),
    ).toEqual(['saved', 'saved', 'recent', 'recent']);
    app.unmount();
  });

  it('omits an empty recent-color rail', () => {
    const { app, root } = mount(ObsOutputColorPalette, {
      label: '文字色',
      modelValue: '#ffffff',
    });

    expect(
      findAll(root, (node) => node.props?.['aria-label'] === '最近使用色票'),
    ).toHaveLength(0);
    app.unmount();
  });

  it.each([
    ['saved', 'Output 常用色票'],
    ['recent', '最近使用色票'],
  ])(
    'bounds the %s rail to the durable eight-color capacity',
    (source, label) => {
      const colors = Array.from(
        { length: 10 },
        (_, index) => `#${String(index).padStart(6, '0')}`,
      );
      const { app, root } = mount(ObsColorSwatchRail, {
        label: source === 'saved' ? '常用' : '最近',
        ariaLabel: label,
        source,
        colors,
        modelValue: colors[0],
      });

      expect(
        findAll(root, (node) => node.props?.['data-color-source'] === source),
      ).toHaveLength(8);
      app.unmount();
    },
  );

  it('selects a recent color with selected and hex semantics', () => {
    const select = vi.fn();
    const { app, root } = mount(ObsOutputColorPalette, {
      label: '文字色',
      modelValue: '#aabbcc',
      recentColors: ['#aabbcc', '#112233'],
      onSelect: select,
    });
    const rail = findAll(
      root,
      (node) => node.props?.['aria-label'] === '最近使用色票',
    )[0];
    const swatches = findAll(root, (node) => node.props?.['data-color']);

    expect(textContent(rail)).toContain('最近');
    expect(swatches).toHaveLength(2);
    expect(swatches[0].props).toMatchObject({
      'aria-label': '套用最近色票 #AABBCC',
      'aria-pressed': true,
    });
    expect(swatches[0].props.title).toBeUndefined();
    trigger(swatches[1], 'onClick');
    expect(select).toHaveBeenCalledWith('#112233');
    app.unmount();
  });

  it('shows one Output-scoped saved palette and toggles the current color', () => {
    const select = vi.fn();
    const toggleSavedColor = vi.fn();
    const { app, root } = mount(ObsOutputColorPalette, {
      label: '強調色',
      modelValue: '#aabbcc',
      savedColors: ['#112233', '#aabbcc'],
      onSelect: select,
      onToggleSavedColor: toggleSavedColor,
    });
    const palette = findAll(
      root,
      (node) => node.props?.['aria-label'] === 'Output 常用色票',
    )[0];
    const swatches = findAll(
      palette,
      (node) => node.props?.['data-color-source'] === 'saved',
    );
    const toggle = findAll(
      root,
      (node) => node.props?.['aria-label'] === '從常用色移除 #AABBCC',
    )[0];

    expect(textContent(palette)).toContain('常用');
    expect(swatches).toHaveLength(2);
    expect(swatches[1].props['aria-pressed']).toBe(true);
    trigger(swatches[0], 'onClick');
    expect(select).toHaveBeenCalledWith('#112233');
    trigger(toggle, 'onClick');
    expect(toggleSavedColor).toHaveBeenCalledWith('#aabbcc');
    app.unmount();
  });

  it('keeps the saved palette discoverable when empty and disables adding when full', () => {
    const empty = mount(ObsOutputColorPalette, {
      label: '文字色',
      modelValue: '#ffffff',
    });
    expect(textContent(empty.root)).toContain('常用');
    expect(textContent(empty.root)).toContain('尚未加入');
    expect(textContent(empty.root)).toContain('加入常用');
    expect(
      findAll(
        empty.root,
        (node) => node.props?.['aria-label'] === '加入常用色 #FFFFFF',
      ),
    ).toHaveLength(1);
    empty.app.unmount();

    const full = mount(ObsOutputColorPalette, {
      label: '文字色',
      modelValue: '#ffffff',
      savedColors: Array.from(
        { length: 8 },
        (_, index) => `#${String(index).padStart(6, '0')}`,
      ),
    });
    const fullAction = findAll(
      full.root,
      (node) => node.props?.['aria-label'] === '常用色已滿（最多 8 色）',
    )[0];
    expect(textContent(full.root)).toContain('常用已滿');
    expect(fullAction.props.disabled).toBe(true);
    full.app.unmount();
  });

  it('wraps swatches against the right edge using shared sizing and focus tokens', () => {
    const railSource = readFileSync(
      new URL('./ObsColorSwatchRail.vue', import.meta.url),
      'utf8',
    );
    const fieldSource = readFileSync(
      new URL('./ObsOutputColorPalette.vue', import.meta.url),
      'utf8',
    );
    const styles =
      railSource.match(/<style scoped>([\s\S]*)<\/style>/u)?.[1] ?? '';

    expect(styles).toMatch(
      /--obs-output-color-swatch-size:\s*calc\(\s*var\(--ui-control-height\)/u,
    );
    expect(styles).toMatch(
      /\.obs-color-swatch-rail__swatches\s*\{[^}]*flex-wrap:\s*wrap;[^}]*justify-content:\s*flex-end;/u,
    );
    expect(styles).toContain('border-radius: var(--ui-radius-xs)');
    expect(styles).toContain('outline: var(--ui-focus-width)');
    expect(styles).toContain(
      'box-shadow: inset 0 0 0 var(--ui-border-width-strong)',
    );
    expect(styles).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu);
    expect(styles).not.toMatch(/\b\d*\.?\d+(?:px|rem)\b/u);
    expect(fieldSource).toMatch(
      /\.obs-output-color-palette__action:disabled\s*\{[^}]*opacity:\s*1/u,
    );
  });
});
