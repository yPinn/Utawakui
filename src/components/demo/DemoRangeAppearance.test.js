import { readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiField from '../ui/UiField.vue';
import UiRange from '../ui/UiRange.vue';
import UiRangeControl from '../ui/range/UiRangeControl.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import DemoRangeAppearance from './DemoRangeAppearance.vue';

const demoInputsSource = readFileSync(
  new URL('./DemoInputs.vue', import.meta.url),
  'utf8',
);
const componentSource = readFileSync(
  new URL('./DemoRangeAppearance.vue', import.meta.url),
  'utf8',
);
const candidateSource = readFileSync(
  new URL('../ui/range/UiRangeControl.vue', import.meta.url),
  'utf8',
);
const rangeSource = readFileSync(
  new URL('../ui/UiRange.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

for (const [component, filename] of [
  [DemoRangeAppearance, './DemoRangeAppearance.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiRange, '../ui/UiRange.vue'],
  [UiRangeControl, '../ui/range/UiRangeControl.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

let body;

beforeEach(() => {
  body = hostNode('body');
  const documentElement = hostNode('html');
  vi.stubGlobal('document', {
    activeElement: null,
    body,
    documentElement,
    hidden: false,
    querySelector: (selector) => (selector === 'body' ? body : null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getComputedStyle: () => ({
      direction: 'ltr',
      fontSize: '16px',
      getPropertyValue: (name) =>
        ({
          '--ui-range-thumb-size': '1rem',
          '--ui-floating-gap': '0.5rem',
          '--ui-floating-viewport-inset': '0.5rem',
        })[name] ?? '',
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DemoRangeAppearance', () => {
  it('mounts a dedicated Range phase after the accepted Checkbox phase', () => {
    expect(demoInputsSource).toContain(
      "import DemoCheckboxAppearance from './DemoCheckboxAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoCheckboxAppearance v-else-if="section.key === \'checkbox\'" />',
    );
    expect(demoInputsSource).toContain(
      "import DemoRangeAppearance from './DemoRangeAppearance.vue';",
    );
    expect(demoInputsSource).toContain(
      '<DemoRangeAppearance v-else-if="section.key === \'range\'" />',
    );
    expect(demoInputsSource).not.toContain(
      '<div v-else-if="section.key === \'range\'" class="demo-sample-grid">',
    );
  });

  it('orders Candidate and Current from geometry through the public contract', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));
    const candidateIndex = html.indexOf('data-range-source="candidate"');
    const currentIndex = html.indexOf('data-range-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Token v2／已遷移 UiRange');
    expect(html).toContain('現行 UiRange');

    const sequence = [
      '尺寸與寬度責任',
      'Owned anatomy',
      '數值與格式內容',
      '離散 stops',
      '狀態外觀與覆蓋',
      'Hint → Error 與 ARIA',
      'Public contract',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-range-source="${source}"[\\s\\S]*?(?=<section[^>]*data-range-source=|$)`,
          'u',
        ),
      )?.[0];
      let previousIndex = -1;
      for (const label of sequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    }
  });

  it('visualizes 36 and 32 CSS px Candidate targets against the Current 30px field row', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    for (const size of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-range-size="${size}"`);
    }
    for (const width of ['narrow', 'reference', 'fluid']) {
      expect(
        html.match(new RegExp(`data-range-width="${width}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Standard target · 36 CSS px');
    expect(html).toContain('Compact target · 32 CSS px');
    expect(html).toContain('Current field row · 30 CSS px');
    expect(html).toContain('Track · 6 CSS px');
    expect(html).toContain('Track／input box · 4 CSS px');
    expect(html).toContain('Thumb · 16 CSS px');
    expect(html).toContain('Width · 100% parent／min 0／max none');
    expect(componentSource).toContain(
      '.demo-range-size--standard {\n  --ui-range-target-size: 2.25rem;',
    );
    expect(componentSource).toContain(
      '.demo-range-size--compact {\n  --ui-range-target-size: 2rem;',
    );
    expect(componentSource).toContain(
      '.demo-range-size--active {\n  --ui-range-target-size: 1.875rem;',
    );
    expect(candidateSource).toContain(
      'height: var(--ui-range-target-size, var(--ui-control-height));',
    );
    expect(candidateSource).not.toContain(
      '--ui-range-target-size: var(--ui-control-height);',
    );
    expect(tokenSource).toContain('--ui-control-track-size-md: 0.375rem;');
    expect(tokenSource).toContain(
      '--ui-range-track-size: var(--ui-control-track-size-md);',
    );
    expect(candidateSource).toContain('height: var(--ui-range-track-size);');
    expect(candidateSource).toContain('width: 100%;');
    expect(candidateSource).toContain('min-width: 0;');
    expect(candidateSource).not.toContain('max-width:');
  });

  it('keeps one native input over a project-owned track, fill, thumb, and optional output', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    for (const part of [
      'input',
      'track',
      'fill',
      'thumb',
      'value',
      'support',
    ]) {
      expect(
        html.match(new RegExp(`data-range-anatomy="${part}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('Native input · full 36／32px track target');
    expect(html).toContain('Project-owned 6px track／fill');
    expect(html).toContain(
      'Project-owned 16px interaction thumb · hidden at rest',
    );
    expect(html).toContain('Current Chromium native track／thumb');
    expect(candidateSource).toContain('type="range"');
    expect(candidateSource).toContain('appearance: none;');
    expect(candidateSource).toContain('position: absolute;');
    expect(candidateSource).toContain(
      'inset-inline: calc(var(--ui-range-thumb-size) / 2);',
    );
    expect(candidateSource).toContain('pointer-events: none;');
    expect(candidateSource).toContain('::-webkit-slider-thumb');
    expect(candidateSource).toContain('background: var(--ui-range-track);');
    expect(candidateSource).toContain('background: var(--ui-range-fill);');
    expect(rangeSource).not.toContain('appearance: none;');
  });

  it('maps every Candidate color role through Token v2 range aliases', () => {
    const aliases = [
      '--ui-range-track: var(--ui-color-text-subtle);',
      '--ui-range-fill: var(--ui-color-text);',
      '--ui-range-fill-hover: var(--ui-color-accent);',
      '--ui-range-fill-active: var(--ui-color-accent-active);',
      '--ui-range-thumb: var(--ui-color-text);',
      '--ui-range-thumb-border: var(--ui-color-canvas);',
      '--ui-range-focus: var(--ui-color-focus);',
      '--ui-range-invalid: var(--ui-color-danger);',
      '--ui-range-stop: var(--ui-color-canvas);',
      '--ui-range-value: var(--ui-color-text-muted);',
    ];

    for (const alias of aliases) expect(tokenSource).toContain(alias);
    expect(candidateSource).not.toContain('--demo-range-track-rest');
    expect(candidateSource).not.toContain('var(--ui-color-accent-soft)');
    const styles = candidateSource.match(
      /<style scoped>([\s\S]*?)<\/style>/u,
    )?.[1];
    expect(styles).not.toMatch(/#[\da-f]{3,8}\b/iu);
  });

  it('hides the thumb at rest and reveals it only for hover, active, or keyboard focus', () => {
    expect(candidateSource).toMatch(
      /::-webkit-slider-thumb\s*\{[\s\S]*?opacity:\s*0;/u,
    );
    expect(candidateSource).toMatch(
      /:hover:not\(:disabled\)::-webkit-slider-thumb[\s\S]*?:focus-visible::-webkit-slider-thumb[\s\S]*?:active:not\(:disabled\)::-webkit-slider-thumb[\s\S]*?opacity:\s*1;/u,
    );
  });

  it('previews a pointer-position time without changing the controlled value', async () => {
    const { app, root } = mount(UiRangeControl, {
      id: 'preview-time',
      label: '播放位置',
      modelValue: 60,
      min: 0,
      max: 180,
      step: 1,
      valueText: '1:00',
      formatValue: (value) =>
        `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`,
    });
    const input = findAll(root, (node) => node.type === 'input')[0];
    input.getBoundingClientRect = () => ({
      bottom: 236,
      height: 36,
      left: 100,
      right: 300,
      top: 200,
      width: 200,
    });

    trigger(input, 'onPointermove', {
      clientX: 154,
      pointerType: 'mouse',
    });
    await nextTick();

    const tooltip = findAll(body, (node) => node.props.role === 'tooltip')[0];
    expect(textContent(tooltip)).toBe('0:45');
    expect(input.props.value).toBe(60);
    expect(input.props['aria-valuetext']).toBe('1:00');
    expect(input.props['aria-describedby']).toBeUndefined();

    trigger(input, 'onPointerleave');
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    app.unmount();
  });

  it('clamps and step-aligns numeric pointer previews', async () => {
    const { app, root } = mount(UiRangeControl, {
      id: 'preview-number',
      label: '變速',
      modelValue: 0.65,
      min: 0.5,
      max: 1.5,
      step: 0.05,
      valueText: '0.65×',
      formatValue: (value) => `${value.toFixed(2)}×`,
    });
    const input = findAll(root, (node) => node.type === 'input')[0];
    input.getBoundingClientRect = () => ({
      bottom: 136,
      height: 36,
      left: 0,
      right: 216,
      top: 100,
      width: 216,
    });

    trigger(input, 'onPointermove', { clientX: 53, pointerType: 'mouse' });
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('0.75×');

    trigger(input, 'onPointermove', { clientX: -100, pointerType: 'mouse' });
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('0.50×');

    trigger(input, 'onPointermove', { clientX: 999, pointerType: 'mouse' });
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('1.50×');
    app.unmount();
  });

  it('keeps touch and disabled ranges free of pointer preview tooltips', async () => {
    const enabled = mount(UiRangeControl, {
      id: 'preview-touch',
      label: '音量',
      modelValue: 50,
      formatValue: (value) => `${value}%`,
    });
    const enabledInput = findAll(
      enabled.root,
      (node) => node.type === 'input',
    )[0];
    trigger(enabledInput, 'onPointermove', {
      clientX: 50,
      pointerType: 'touch',
    });
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    enabled.app.unmount();

    const disabled = mount(UiRangeControl, {
      id: 'preview-disabled',
      label: '音量',
      modelValue: 50,
      disabled: true,
      formatValue: (value) => `${value}%`,
    });
    const disabledInput = findAll(
      disabled.root,
      (node) => node.type === 'input',
    )[0];
    trigger(disabledInput, 'onPointermove', {
      clientX: 50,
      pointerType: 'mouse',
    });
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    disabled.app.unmount();
  });

  it('shows native step snapping with optional in-track ticks and no reserved marks row', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    expect(html.match(/data-range-stops/gu)).toHaveLength(2);
    expect(html).toContain('0／25／50／75／100 · native step 25');
    expect(html).toContain('Token v2：5 個軌道內 ticks，不增加垂直預留');
    expect(html).toContain('Current：native step 吸附，沒有自訂 tick layer');
    expect(candidateSource).toContain(
      'marks: { type: Array, default: () => [] }',
    );
    expect(candidateSource).toContain('class="ui-range-control__stops"');
    expect(candidateSource).toContain('aria-hidden="true"');
    expect(candidateSource).toMatch(
      /\.ui-range-control__stops[\s\S]*?pointer-events: none;/u,
    );
    expect(rangeSource).toContain('min-inline-size: 2.5rem;');
    expect(rangeSource).toContain('font-variant-numeric: tabular-nums;');
    expect(candidateSource).not.toContain('min-width: 5ch;');
    expect(candidateSource).not.toContain('inline-size: 5ch;');
    expect(candidateSource).not.toContain('ui-range-control__marks-row');

    const { app, root } = mount(DemoRangeAppearance);
    const input = findAll(
      root,
      (node) =>
        node.type === 'input' &&
        node.props.id === 'demo-range-candidate-stops-equal',
    )[0];
    expect(input.props).toMatchObject({ min: 0, max: 100, step: 25 });
    const ticks = findAll(
      root,
      (node) => node.props['data-range-stop'] !== undefined,
    );
    expect(ticks).toHaveLength(5);
    expect(ticks.map((tick) => tick.props['data-range-stop'])).toEqual([
      0, 25, 50, 75, 100,
    ]);
    trigger(input, 'onInput', {
      target: { valueAsNumber: 75, value: '75' },
    });
    await nextTick();
    expect(input.props.value).toBe(75);
    app.unmount();
  });

  it('covers numeric boundaries, negative and fractional steps, long value text, and native fallback', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    for (const content of [
      'minimum',
      'maximum',
      'negative',
      'fractional',
      'time',
      'long-value-text',
      'native-value',
    ]) {
      expect(
        html.match(new RegExp(`data-range-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('−12 dB');
    expect(html).toContain('0.65×');
    expect(html).toContain('0:59');
    expect(html).toContain('標準速度／100.0 percent');
    expect(html).toContain('No valueText · native numeric announcement');
    expect(candidateSource).toContain("'--ui-range-ratio'");
    expect(candidateSource).toContain('Math.min(1, Math.max(0');
    expect(rangeSource).toContain('@container (max-width: 18rem)');
    expect(rangeSource).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(rangeSource).toMatch(
      /:deep\(\.ui-field__label\)[\s\S]*?overflow-wrap: anywhere;/u,
    );
    expect(componentSource).toMatch(
      /\.demo-range-anatomy__map span[\s\S]*?overflow-wrap: anywhere;/u,
    );
  });

  it('covers range-specific boundary and interaction states without empty, required, or readonly', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));
    const states = [
      'default',
      'minimum',
      'maximum',
      'hover',
      'focus',
      'invalid',
      'disabled',
    ];

    for (const state of states) {
      expect(
        html.match(new RegExp(`data-range-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html.match(/data-range-coverage-matrix/gu)).toHaveLength(2);
    expect(html).toContain('沒有 empty、required 或 readonly state。');
    expect(componentSource).not.toContain(':required');
    expect(componentSource).not.toContain(':readonly');
    expect(candidateSource).toMatch(
      /:focus-visible::-webkit-slider-thumb[\s\S]*?var\(--ui-range-focus\)/u,
    );
    expect(candidateSource).toMatch(
      /\[aria-invalid='true'\][\s\S]*?var\(--ui-range-invalid\)/u,
    );
  });

  it('preserves controlled numeric updates, min/max/step, and forwarded native attributes', async () => {
    const { app, root } = mount(DemoRangeAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];
    const id = 'demo-range-candidate-content-fractional';

    expect(inputById(id).props).toMatchObject({
      value: 0.65,
      min: 0.5,
      max: 1.5,
      step: 0.05,
      'aria-valuetext': '0.65×',
    });
    trigger(inputById(id), 'onInput', {
      target: { valueAsNumber: 0.7, value: '0.7' },
    });
    await nextTick();
    expect(inputById(id).props.value).toBe(0.7);
    expect(inputById(id).props['aria-valuetext']).toBe('0.70×');
    expect(
      textContent(
        findAll(
          root,
          (node) => node.type === 'output' && node.props.for === id,
        )[0],
      ),
    ).toBe('0.70×');

    const nativeFallbackId = 'demo-range-candidate-content-native-value';
    trigger(inputById(nativeFallbackId), 'onInput', {
      target: { valueAsNumber: Number.NaN, value: '64' },
    });
    await nextTick();
    expect(inputById(nativeFallbackId).props.value).toBe(64);
    expect(
      inputById('demo-range-candidate-validation-hint').props,
    ).toMatchObject({
      name: 'demo-range-candidate-level',
      'data-contract': 'native-forwarding',
    });
    expect(
      inputById('demo-range-candidate-state-disabled').props.disabled,
    ).toBe(true);
    app.unmount();
  });

  it('demonstrates value text, Hint replacement, and merged ARIA descriptions', () => {
    const { app, root } = mount(DemoRangeAppearance);
    const inputById = (id) =>
      findAll(root, (node) => node.type === 'input' && node.props.id === id)[0];

    const hint = inputById('demo-range-candidate-validation-hint');
    const invalid = inputById('demo-range-candidate-validation-error');
    expect(hint.props['aria-describedby']).toBe(
      'range-external-note demo-range-candidate-validation-hint-hint',
    );
    expect(hint.props['aria-valuetext']).toBe('72%');
    expect(hint.props['aria-invalid']).toBeUndefined();
    expect(invalid.props['aria-describedby']).toBe(
      'range-external-note demo-range-candidate-validation-error-error',
    );
    expect(invalid.props['aria-invalid']).toBe(true);
    expect(invalid.props['aria-valuetext']).toBe('超過建議值：140%');
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-range-candidate-validation-error-hint',
      ),
    ).toHaveLength(0);
    expect(
      findAll(
        root,
        (node) =>
          node.props.id === 'demo-range-candidate-validation-error-error' &&
          node.props.role === 'alert',
      ),
    ).toHaveLength(1);
    app.unmount();
  });

  it('documents the bounded public contract and isolates Candidate styling', async () => {
    const html = await renderToString(createSSRApp(DemoRangeAppearance));

    expect(html).toContain('Number modelValue → update:modelValue');
    expect(html).toContain('min · max · step · disabled · invalid');
    expect(html).toContain('valueText → output／aria-valuetext');
    expect(html).toContain('name · native attrs／listeners');
    expect(html).toContain('focus() · bounded native-control access');
    expect(html).toContain(
      'Formal Token v2 neutral rest fill／interaction-only thumb／pointer preview tooltip／optional in-track ticks · Native range input · No required／readonly／size prop',
    );
    expect(componentSource).toContain('demo-range-layer--candidate');
    expect(componentSource).toContain('.demo-range-layer--current');
    expect(componentSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-range-layer--current)",
    );
    expect(componentSource).toContain('@container (max-width: 48rem)');
    expect(rangeSource).not.toContain('data-range-state');
    expect(rangeSource).toContain('marks:');
  });
});
