import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
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
const candidateSource = readFileSync(
  new URL('../ui/range/UiRangeControl.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
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
      /:hover:not\(\s*:disabled\s*\)::-webkit-slider-thumb[\s\S]*?:focus-visible::-webkit-slider-thumb[\s\S]*?:active:not\(\s*:disabled\s*\)::-webkit-slider-thumb[\s\S]*?opacity:\s*1;/u,
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
    trigger(input, 'onPointermove', {
      clientX: 53,
      pointerType: 'mouse',
    });
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('0.75×');
    trigger(input, 'onPointermove', {
      clientX: -100,
      pointerType: 'mouse',
    });
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('0.50×');
    trigger(input, 'onPointermove', {
      clientX: 999,
      pointerType: 'mouse',
    });
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
      target: {
        valueAsNumber: 0.7,
        value: '0.7',
      },
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
      target: {
        valueAsNumber: Number.NaN,
        value: '64',
      },
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
});
