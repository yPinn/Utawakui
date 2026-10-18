import { h, nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Field from './ImportSourceField.vue';
import SearchBox from '../ui/UiSearchBox.vue';
import UiStack from '../ui/UiStack.vue';
import UiHint from '../ui/UiHint.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

vi.mock('../ui/UiTooltip.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        slots.trigger?.({ triggerProps: {} }),
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    props: ['variant'],
    setup:
      (props, { attrs, slots }) =>
      () =>
        h(
          'button',
          { ...attrs, 'data-variant': props.variant, type: 'button' },
          slots.default?.(),
        ),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'icon', 'variant', 'disabled'],
    setup:
      (props, { attrs }) =>
      () =>
        h('button', {
          ...attrs,
          'aria-label': props.label,
          disabled: props.disabled,
          type: 'button',
        }),
  },
}));

for (const [component, file] of [
  [Field, './ImportSourceField.vue'],
  [SearchBox, '../ui/UiSearchBox.vue'],
  [UiStack, '../ui/UiStack.vue'],
  [UiHint, '../ui/UiHint.vue'],
]) {
  attachClientRender(component, file, import.meta.url);
}
const apps = [];
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
});

function setup() {
  const read = vi
    .fn()
    .mockResolvedValue('https://www.youtube.com/watch?v=fieldtest01');
  vi.stubGlobal('window', {
    Utawakui: { getImportClipboardSuggestion: read },
  });
  const state = reactive({ value: '', active: true, busy: false });
  const resolve = vi.fn();
  const view = mount({
    setup: () => () =>
      h(Field, {
        modelValue: state.value,
        active: state.active,
        busy: state.busy,
        'onUpdate:modelValue': (value) => {
          state.value = value;
        },
        onResolve: resolve,
      }),
  });
  apps.push(view.app);
  return {
    ...view,
    read,
    state,
    resolve,
    input: () => findAll(view.root, (node) => node.type === 'input')[0],
    button: (label) =>
      findAll(
        view.root,
        (node) => node.type === 'button' && textContent(node) === label,
      )[0],
  };
}
async function focus(view) {
  trigger(view.input(), 'onFocus');
  await Promise.resolve();
  await nextTick();
}

describe('import source field', () => {
  it('forwards native focus and puts the primary action last, filling without submitting', async () => {
    const view = setup();
    expect(view.read).not.toHaveBeenCalled();
    await focus(view);
    const actions = findAll(view.root, (node) => node.type === 'button')
      .map(textContent)
      .filter(Boolean);
    expect(actions).toEqual(['略過', '貼上連結']);
    expect(view.button('貼上連結').props['data-variant']).toBe('accent');
    trigger(view.button('貼上連結'), 'onClick');
    await nextTick();
    expect(view.state.value).toContain('fieldtest01');
    expect(view.resolve).not.toHaveBeenCalled();
    expect(view.button('貼上連結')).toBeUndefined();
    expect(view.input().focus).toHaveBeenCalled();
  });

  it('dismisses and preserves ordinary typing/paste and explicit submit', async () => {
    const view = setup();
    view.read.mockResolvedValue('https://www.youtube.com/watch?v=fieldtest02');
    await focus(view);
    trigger(view.button('略過'), 'onClick');
    await nextTick();
    await focus(view);
    expect(view.button('貼上連結')).toBeUndefined();
    trigger(view.input(), 'onInput', {
      target: { value: 'my manually pasted link' },
    });
    await nextTick();
    expect(view.state.value).toBe('my manually pasted link');
    const form = findAll(view.root, (node) => node.type === 'form')[0];
    trigger(form, 'onSubmit', { preventDefault() {} });
    expect(view.resolve).toHaveBeenCalledOnce();
    view.state.busy = true;
    await nextTick();
    trigger(form, 'onSubmit', { preventDefault() {} });
    expect(view.resolve).toHaveBeenCalledOnce();
  });

  it('removes a visible suggestion when the dock closes', async () => {
    const view = setup();
    view.read.mockResolvedValue('https://www.youtube.com/watch?v=fieldtest03');
    await focus(view);
    expect(view.button('貼上連結')).toBeDefined();
    view.state.active = false;
    await nextTick();
    expect(view.button('貼上連結')).toBeUndefined();
  });
});
