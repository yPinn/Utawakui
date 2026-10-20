import { h, nextTick, reactive } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import Component from './OutputRuntimeSettingsBlock.vue';

const owners = vi.hoisted(() => ({}));
vi.mock('../../composables/useOutputRuntimeContext.js', () => ({
  useOutputRuntimeContext: () => owners.output,
}));
vi.mock('../../composables/output/useSpoutOutput.js', () => ({
  useSpoutOutput: () => owners.spout,
}));
vi.mock('./SettingsDocumentItem.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('section', [slots.actions?.(), slots.feedback?.()]),
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('button', slots.default?.()),
  },
}));
vi.mock('../ui/UiCheckbox.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup:
      (p, { emit }) =>
      () =>
        h('input', {
          type: 'checkbox',
          checked: p.modelValue,
          onChange: (e) => emit('update:modelValue', e.target.checked),
        }),
  },
}));
vi.mock('../ui/UiTextField.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup:
      (p, { emit }) =>
      () =>
        h('input', {
          value: p.modelValue,
          onInput: (e) => emit('update:modelValue', e.target.value),
        }),
  },
}));
vi.mock('../ui/UiDisclosure.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('p', slots.default?.()),
  },
}));
vi.mock('../ui/UiSegmentedControl.vue', () => ({
  default: { render: () => null },
}));

let mounted;
const field = (id) =>
  findAll(mounted.root, (n) => n.type === 'input' && n.props.id === id)[0];
const button = (label) =>
  findAll(
    mounted.root,
    (n) => n.type === 'button' && textContent(n).trim() === label,
  )[0];
async function edit(id, value) {
  trigger(field(id), 'onInput', { target: { value } });
  await nextTick();
}
beforeEach(() => {
  owners.output = {
    state: reactive({
      status: { running: false },
      settings: { autoStart: false, port: 8700, displayDelayMs: 0 },
      suggestedPorts: [8701],
      errors: {},
      isStarting: false,
      isStopping: false,
      isSavingSettings: false,
    }),
    refreshStatus: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    updateSettings: vi.fn(async (next) => {
      owners.output.state.settings = next;
      return true;
    }),
  };
  owners.spout = {
    state: reactive({
      status: {
        supported: true,
        desired: {},
        observed: { lifecycle: 'stopped' },
      },
      errors: {},
    }),
    refresh: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    setFrameRateProfile: vi.fn(),
  };
  attachClientRender(
    Component,
    './OutputRuntimeSettingsBlock.vue',
    import.meta.url,
  );
  mounted = mount(Component);
});
afterEach(() => mounted.app.unmount());

it('keeps connection edits local until the explicit save, then submits both fields once', async () => {
  await edit('output-runtime-port', '8710');
  await edit('output-display-delay', '125');
  field('output-runtime-port').props.onChange?.();
  expect(owners.output.updateSettings).not.toHaveBeenCalled();
  trigger(button('儲存設定'), 'onClick');
  await nextTick();
  expect(owners.output.updateSettings).toHaveBeenCalledExactlyOnceWith({
    autoStart: false,
    port: 8710,
    displayDelayMs: 125,
  });
});

it('saves auto-start independently and retains an invalid unsaved connection draft', async () => {
  await edit('output-runtime-port', 'invalid');
  await edit('output-display-delay', '125');
  trigger(field('output-runtime-auto-start'), 'onChange', {
    target: { checked: true },
  });
  await nextTick();
  expect(owners.output.updateSettings).toHaveBeenCalledExactlyOnceWith({
    autoStart: true,
    port: 8700,
    displayDelayMs: 0,
  });
  expect(field('output-runtime-port').props.value).toBe('invalid');
  expect(field('output-display-delay').props.value).toBe('125');
});

it('chooses a suggested port as a draft without starting or saving the service', async () => {
  trigger(button('8701'), 'onClick');
  await nextTick();
  expect(field('output-runtime-port').props.value).toBe('8701');
  expect(owners.output.updateSettings).not.toHaveBeenCalled();
  expect(owners.output.start).not.toHaveBeenCalled();
});

it.each(['isLoadingSettings', 'isSavingSettings', 'readError'])(
  'blocks connection save while %s is present',
  async (kind) => {
    await edit('output-runtime-port', '8710');
    if (kind === 'readError')
      owners.output.state.errors['load-settings'] = '無法讀取';
    else owners.output.state[kind] = true;
    await nextTick();
    expect(button('儲存設定').props.disabled).toBe(true);
    trigger(button('儲存設定'), 'onClick');
    expect(owners.output.updateSettings).not.toHaveBeenCalled();
  },
);

it('keeps failed connection edits and starts only with the saved configuration', async () => {
  owners.output.updateSettings.mockResolvedValueOnce(false);
  await edit('output-runtime-port', '8710');
  await edit('output-display-delay', '125');
  trigger(button('儲存設定'), 'onClick');
  await nextTick();
  expect(field('output-runtime-port').props.value).toBe('8710');
  expect(field('output-display-delay').props.value).toBe('125');
  expect(owners.output.state.settings.port).toBe(8700);
  owners.output.updateSettings.mockClear();
  trigger(
    findAll(
      mounted.root,
      (n) => n.type === 'button' && textContent(n).trim() === '啟動',
    )[0],
    'onClick',
  );
  expect(owners.output.start).toHaveBeenCalledOnce();
  expect(owners.output.updateSettings).not.toHaveBeenCalled();
});
