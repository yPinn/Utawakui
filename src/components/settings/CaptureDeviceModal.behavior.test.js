import { h, nextTick, reactive, shallowRef } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Component from './CaptureDeviceModal.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiChip from '../ui/UiChip.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
const state = vi.hoisted(() => ({}));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ state: state.player }),
}));
vi.mock('../../composables/useAudioOutput.js', () => ({
  useAudioOutput: () => state.audio,
}));
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    props: ['open'],
    setup:
      (p, { slots }) =>
      () =>
        p.open
          ? h('div', [slots['header-actions']?.(), slots.default?.()])
          : null,
  },
}));
vi.mock('../ui/UiScrollLayout.vue', () => ({
  default: {
    setup:
      (_p, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}));
vi.mock('./VirtualCableGuideModal.vue', () => ({
  default: { render: () => null },
}));
let mounted;
beforeEach(() => {
  state.player = reactive({ captureDeviceId: 'default' });
  state.audio = {
    devices: shallowRef([
      { deviceId: 'default', label: 'Default - CABLE Input' },
      { deviceId: 'cable', label: 'CABLE Input' },
      { deviceId: 'speakers', label: '一個完整而且很長的喇叭裝置名稱' },
    ]),
    monitorDeviceLabel: shallowRef('系統預設裝置'),
    captureErrorNotice: shallowRef(null),
    selectDevice: vi.fn((id) => {
      state.player.captureDeviceId = id;
    }),
  };
  attachClientRender(Component, './CaptureDeviceModal.vue', import.meta.url);
  attachClientRender(UiRadioGroup, '../ui/UiRadioGroup.vue', import.meta.url);
  attachClientRender(UiChip, '../ui/UiChip.vue', import.meta.url);
  mounted = mount(Component, { open: true });
});
afterEach(() => mounted?.app.unmount());
const radios = () =>
  findAll(mounted.root, (n) => n.type === 'input' && n.props.type === 'radio');
it('preserves a saved default alias while showing one canonical choice and the device groups', () => {
  expect(radios()).toHaveLength(3);
  expect(
    radios()
      .filter((n) => n.props.checked)
      .map((n) => n.props.value),
  ).toEqual(['cable']);
  expect(textContent(mounted.root)).toContain('虛擬音效裝置');
  expect(textContent(mounted.root)).toContain('其他輸出裝置');
  expect(textContent(mounted.root)).toContain('一個完整而且很長的喇叭裝置名稱');
  expect(state.audio.selectDevice).not.toHaveBeenCalled();
});
it('uses the existing owner for an explicit selection and the off option preserves monitoring', async () => {
  trigger(
    radios().find((n) => n.props.value === 'speakers'),
    'onChange',
  );
  await nextTick();
  expect(state.audio.selectDevice).toHaveBeenLastCalledWith('speakers');
  trigger(
    radios().find((n) => n.props.value === 0),
    'onChange',
  );
  await nextTick();
  expect(state.audio.selectDevice).toHaveBeenLastCalledWith(null);
  expect(radios().find((n) => n.props.value === 0).props.checked).toBe(true);
  expect(textContent(mounted.root)).toContain('仍從 系統預設裝置 播放');
});
