import { h, nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

vi.mock('./SettingsDocumentItem.vue', () => ({
  default: {
    props: ['title', 'status', 'value'],
    setup:
      (props, { slots }) =>
      () =>
        h('section', [
          props.title,
          props.status,
          props.value,
          slots.actions?.(),
          slots.feedback?.(),
        ]),
  },
}));
vi.mock('../ui/UiTextField.vue', () => ({
  default: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup:
      (props, { emit }) =>
      () =>
        h('input', {
          value: props.modelValue,
          onInput: (event) => emit('update:modelValue', event.target.value),
        }),
  },
}));
vi.mock('../ui/UiButton.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('button', slots.default?.()),
  },
}));
vi.mock('../ui/UiCheckbox.vue', () => ({
  default: { setup: () => () => h('input', { type: 'checkbox' }) },
}));
vi.mock('../ui/UiNotice.vue', () => ({
  default: {
    props: ['message'],
    setup: (props) => () => h('p', { role: 'alert' }, props.message),
  },
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('p', slots.default?.()),
  },
}));
vi.mock('../ui/UiModal.vue', () => ({ default: { render: () => null } }));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: { props: ['label'], setup: (p) => () => h('button', p.label) },
}));
vi.mock('./SettingsDependencyActions.vue', () => ({
  default: { render: () => null },
}));

import UiDisclosure from '../ui/UiDisclosure.vue';
import ObsIntegrationSettingsBlock from './ObsIntegrationSettingsBlock.vue';
import SettingsFeatureGateRow from './SettingsFeatureGateRow.vue';
import SettingsDependencyList from './SettingsDependencyList.vue';

for (const [component, path] of [
  [UiDisclosure, '../ui/UiDisclosure.vue'],
  [ObsIntegrationSettingsBlock, './ObsIntegrationSettingsBlock.vue'],
  [SettingsFeatureGateRow, './SettingsFeatureGateRow.vue'],
  [SettingsDependencyList, './SettingsDependencyList.vue'],
]) {
  attachClientRender(component, path, import.meta.url);
}

const find = (root, type) => findAll(root, (node) => node.type === type)[0];
function toggle(details, open) {
  trigger(details, 'onToggle', { currentTarget: { open } });
}
function obsProps() {
  return reactive({
    host: '127.0.0.1',
    status: {
      desired: { enabled: true },
      observed: { lifecycle: 'ready' },
      error: null,
    },
    error: '',
  });
}

describe('Settings progressive disclosure', () => {
  it('lets a first-time user configure OBS before making a connection request', async () => {
    const props = obsProps();
    props.status.desired.enabled = false;
    props.status.observed.lifecycle = 'disabled';
    const save = vi.fn();
    props['onUpdate:host'] = (host) => {
      props.host = host;
    };
    const { app, root } = mount(ObsIntegrationSettingsBlock, {
      ...props,
      onSave: save,
    });
    const details = find(root, 'details');
    expect(details).toBeDefined();
    expect(details.props.open).toBe(false);
    toggle(details, true);
    await nextTick();
    const host = findAll(
      root,
      (node) => node.props.id === 'obs-integration-host',
    )[0];
    trigger(host, 'onInput', { target: { value: 'studio.local' } });
    expect(props.host).toBe('studio.local');
    expect(save).not.toHaveBeenCalled();
    const connect = findAll(
      root,
      (node) =>
        node.type === 'button' && textContent(node).includes('儲存並連線'),
    )[0];
    trigger(connect, 'onClick');
    expect(save).toHaveBeenCalledWith({ enabled: true });
    app.unmount();
  });
  it('uses explicit connection actions independently of the feature-enabled status', async () => {
    const props = obsProps();
    const save = vi.fn();
    const { app, root } = mount(ObsIntegrationSettingsBlock, {
      ...props,
      onSave: save,
    });
    const button = findAll(
      root,
      (node) => node.props.id === 'obs-integration-enabled',
    )[0];
    expect(button.type).toBe('button');
    expect(textContent(button)).toBe('停止');
    trigger(button, 'onClick');
    expect(save).toHaveBeenCalledWith({ enabled: false });
    app.unmount();
  });
  it('retains the OBS draft and mounted fields across native disclosure toggles', async () => {
    const props = obsProps();
    props['onUpdate:host'] = (host) => {
      props.host = host;
    };
    const { app, root } = mount(ObsIntegrationSettingsBlock, props);
    const details = find(root, 'details');
    expect(details.props.open).toBe(false);
    const host = findAll(
      root,
      (node) => node.props.id === 'obs-integration-host',
    )[0];
    toggle(details, true);
    await nextTick();
    trigger(host, 'onInput', { target: { value: 'studio.local' } });
    await nextTick();
    toggle(details, false);
    await nextTick();
    toggle(details, true);
    await nextTick();
    expect(props.host).toBe('studio.local');
    expect(
      findAll(root, (node) => node.props.id === 'obs-integration-host')[0],
    ).toBe(host);
    expect(host.props.value).toBe('studio.local');
    app.unmount();
  });

  it('keeps status, export and recovery outside the collapsed OBS form', async () => {
    const props = obsProps();
    const onExportChapters = vi.fn();
    const onRetryConnect = vi.fn();
    const { app, root } = mount(ObsIntegrationSettingsBlock, {
      ...props,
      status: props.status,
      onExportChapters,
      onRetryConnect,
    });
    const details = find(root, 'details');
    expect(textContent(details)).not.toContain('匯出時間標記');
    const exportButton = findAll(
      root,
      (node) =>
        node.type === 'button' && textContent(node).includes('匯出時間標記'),
    )[0];
    trigger(exportButton, 'onClick');
    expect(onExportChapters).toHaveBeenCalledOnce();
    props.status.observed.lifecycle = 'error';
    props.status.error = { message: '請檢查 OBS 密碼。' };
    await nextTick();
    expect(details.props.open).toBe(true);
    toggle(details, false);
    await nextTick();
    const alert = find(root, 'p');
    expect(textContent(alert)).toContain('請檢查 OBS 密碼。');
    expect(findAll(details, (node) => node === alert)).toHaveLength(0);
    const retry = findAll(
      root,
      (node) =>
        node.type === 'button' && textContent(node).includes('重試連線'),
    )[0];
    trigger(retry, 'onClick');
    expect(onRetryConnect).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('opens the OBS form when a save reports a new validation error', async () => {
    const props = obsProps();
    const { app, root } = mount(ObsIntegrationSettingsBlock, props);
    const details = find(root, 'details');
    expect(details.props.open).toBe(false);
    props.error = '請輸入有效的主機名稱或 IP。';
    await nextTick();
    expect(details.props.open).toBe(true);
    app.unmount();
  });

  it('opens dependency management for a setup target without hiding tool status', async () => {
    const props = reactive({
      gate: { id: 'test', title: '音訊處理', enabled: true, body: [] },
      items: [
        {
          id: 'model',
          title: '快速模型',
          status: '已準備',
          statusTone: 'success',
        },
      ],
      actionLabel: '啟用',
      highlighted: false,
    });
    const { app, root } = mount(SettingsFeatureGateRow, props, {
      items: () => h('p', 'GPU 已啟用'),
    });
    const details = find(root, 'details');
    expect(details.props.open).toBe(false);
    expect(textContent(find(root, 'summary'))).toContain('已就緒');
    expect(textContent(details)).not.toContain('GPU 已啟用');
    props.highlighted = true;
    await nextTick();
    expect(details.props.open).toBe(true);
    toggle(details, false);
    await nextTick();
    props.highlighted = false;
    await nextTick();
    props.items[0].statusTone = 'warning';
    props.items[0].needsAttention = true;
    await nextTick();
    expect(details.props.open).toBe(true);
    expect(textContent(find(root, 'summary'))).toContain('1 項待處理');
    app.unmount();
  });
});
