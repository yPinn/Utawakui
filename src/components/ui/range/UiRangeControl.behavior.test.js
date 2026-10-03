import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UiTooltipSurface from '../tooltip/UiTooltipSurface.vue';
import UiRangeControl from './UiRangeControl.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  textContent,
  trigger,
} from '../uiTestHost.js';

for (const [component, filename] of [
  [UiRangeControl, './UiRangeControl.vue'],
  [UiTooltipSurface, '../tooltip/UiTooltipSurface.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}

let body;
let direction;

beforeEach(() => {
  body = hostNode('body');
  direction = 'ltr';
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
      direction,
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

function inputRect(input) {
  input.getBoundingClientRect = () => ({
    bottom: 236,
    height: 36,
    left: 100,
    right: 300,
    top: 200,
    width: 200,
  });
}

describe('UiRangeControl', () => {
  it('keeps one native numeric input as the model and attribute authority', () => {
    const update = vi.fn();
    const change = vi.fn();
    const { app, root } = mount(UiRangeControl, {
      id: 'formal-volume',
      class: 'consumer-range',
      modelValue: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      valueText: '50%',
      name: 'volume',
      'data-control': 'volume',
      onChange: change,
      'onUpdate:modelValue': update,
    });
    const inputs = findAll(root, (node) => node.props.type === 'range');
    const input = inputs[0];

    expect(inputs).toHaveLength(1);
    expect(input.props).toMatchObject({
      id: 'formal-volume',
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      name: 'volume',
      'data-control': 'volume',
      'aria-valuetext': '50%',
    });
    trigger(input, 'onInput', {
      target: { valueAsNumber: 0.7, value: '0.7' },
    });
    trigger(input, 'onChange', { target: input });
    expect(update).toHaveBeenCalledWith(0.7);
    expect(change).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('previews a step-aligned formatted pointer value without changing the model', async () => {
    const update = vi.fn();
    const { app, root } = mount(UiRangeControl, {
      id: 'formal-time',
      modelValue: 60,
      min: 0,
      max: 180,
      step: 1,
      valueText: '1:00 / 3:00',
      formatValue: (value) =>
        `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`,
      'onUpdate:modelValue': update,
    });
    const input = findAll(root, (node) => node.props.type === 'range')[0];
    inputRect(input);

    trigger(input, 'onPointermove', {
      clientX: 154,
      pointerType: 'mouse',
    });
    await nextTick();

    const tooltip = findAll(body, (node) => node.props.role === 'tooltip')[0];
    expect(textContent(tooltip)).toBe('0:45');
    expect(input.props.value).toBe(60);
    expect(input.props['aria-valuetext']).toBe('1:00 / 3:00');
    expect(input.props['aria-describedby']).toBeUndefined();
    expect(update).not.toHaveBeenCalled();

    trigger(input, 'onPointerleave');
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    app.unmount();
  });

  it('clamps numeric previews, defaults to numeric copy, and mirrors value direction in RTL', async () => {
    const { app, root } = mount(UiRangeControl, {
      id: 'formal-number',
      modelValue: 50,
      min: 0,
      max: 100,
      step: 25,
    });
    const input = findAll(root, (node) => node.props.type === 'range')[0];
    inputRect(input);

    trigger(input, 'onPointermove', { clientX: -100, pointerType: 'pen' });
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('0');

    direction = 'rtl';
    trigger(input, 'onPointermove', { clientX: 108, pointerType: 'mouse' });
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('100');
    app.unmount();
  });

  it('keeps disabled and touch input free of pointer preview', async () => {
    const disabled = mount(UiRangeControl, {
      id: 'formal-disabled',
      modelValue: 50,
      disabled: true,
    });
    const disabledInput = findAll(
      disabled.root,
      (node) => node.props.type === 'range',
    )[0];
    inputRect(disabledInput);
    trigger(disabledInput, 'onPointermove', {
      clientX: 150,
      pointerType: 'mouse',
    });
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    disabled.app.unmount();

    const touch = mount(UiRangeControl, {
      id: 'formal-touch',
      modelValue: 50,
    });
    const touchInput = findAll(
      touch.root,
      (node) => node.props.type === 'range',
    )[0];
    inputRect(touchInput);
    trigger(touchInput, 'onPointermove', {
      clientX: 150,
      pointerType: 'touch',
    });
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    touch.app.unmount();
  });

  it('normalizes bounded marks into a presentation-only track layer', () => {
    const { app, root } = mount(UiRangeControl, {
      modelValue: 50,
      min: 0,
      max: 100,
      marks: [100, 50, 0, 50, -25, Number.NaN, 125],
    });
    const stops = findAll(
      root,
      (node) => node.props['data-range-stop'] !== undefined,
    );

    expect(stops.map((stop) => stop.props['data-range-stop'])).toEqual([
      0, 50, 100,
    ]);
    expect(
      findAll(root, (node) => node.props.class === 'ui-range-control__stops')[0]
        .props['aria-hidden'],
    ).toBe('true');
    app.unmount();
  });

  it('handles unsnapped values and invalid pointer geometry without exposing a preview', async () => {
    const update = vi.fn();
    const unsnapped = mount(UiRangeControl, {
      modelValue: 25,
      min: 0,
      max: 100,
      step: 0,
      formatValue: () => '',
      'onUpdate:modelValue': update,
    });
    const unsnappedInput = findAll(
      unsnapped.root,
      (node) => node.props.type === 'range',
    )[0];
    inputRect(unsnappedInput);

    trigger(unsnappedInput, 'onPointermove', {
      clientX: 200,
      pointerType: 'mouse',
    });
    await nextTick();
    expect(
      textContent(findAll(body, (node) => node.props.role === 'tooltip')[0]),
    ).toBe('50');
    trigger(unsnappedInput, 'onInput', {
      target: { valueAsNumber: Number.NaN, value: '42' },
    });
    expect(update).toHaveBeenCalledWith(42);
    unsnapped.app.unmount();

    const invalidDomain = mount(UiRangeControl, {
      modelValue: 10,
      min: 10,
      max: 10,
      marks: [10],
    });
    const invalidDomainInput = findAll(
      invalidDomain.root,
      (node) => node.props.type === 'range',
    )[0];
    inputRect(invalidDomainInput);
    trigger(invalidDomainInput, 'onPointermove', {
      clientX: 150,
      pointerType: 'mouse',
    });
    trigger(invalidDomainInput, 'onPointermove', {
      clientX: Number.NaN,
      pointerType: 'mouse',
    });
    await nextTick();
    expect(
      findAll(
        invalidDomain.root,
        (node) => node.props['data-range-stop'] !== undefined,
      ),
    ).toHaveLength(0);
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    invalidDomain.app.unmount();

    const tooNarrow = mount(UiRangeControl, { modelValue: 50 });
    const tooNarrowInput = findAll(
      tooNarrow.root,
      (node) => node.props.type === 'range',
    )[0];
    tooNarrowInput.getBoundingClientRect = () => ({
      bottom: 210,
      height: 10,
      left: 100,
      right: 110,
      top: 200,
      width: 10,
    });
    trigger(tooNarrowInput, 'onPointermove', {
      clientX: 105,
      pointerType: 'pen',
    });
    await nextTick();
    expect(findAll(body, (node) => node.props.role === 'tooltip')).toHaveLength(
      0,
    );
    tooNarrow.app.unmount();
  });
});
