import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive } from 'vue';
import SeparationPresetControl from './SeparationPresetControl.vue';
import UiButton from '../ui/UiButton.vue';
import UiField from '../ui/UiField.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTooltip from '../ui/UiTooltip.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
  SEPARATION_PRESET_SELECT_TITLE,
} from '../../constants/separationPresets.js';

for (const [component, path] of [
  [SeparationPresetControl, './SeparationPresetControl.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiTooltip, '../ui/UiTooltip.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, path, import.meta.url);

let app;
afterEach(() => app?.unmount());

function setup(overrides = {}) {
  const props = reactive({
    hasTrack: true,
    presetOptions: SEPARATION_PRESET_OPTIONS,
    selectedPresetId: DEFAULT_SEPARATION_PRESET_ID,
    presetTitle: SEPARATION_PRESET_SELECT_TITLE,
    onPresetChange: vi.fn(),
    ...overrides,
  });
  const mounted = mount(SeparationPresetControl, props);
  app = mounted.app;
  const select = () => findAll(mounted.root, (n) => n.type === 'select')[0];
  return { props, select };
}

describe('SeparationPresetControl behavior', () => {
  it('emits the chosen preset id through the shared select', () => {
    const { props, select } = setup();
    const next = SEPARATION_PRESET_OPTIONS.find(
      (preset) => preset.id !== DEFAULT_SEPARATION_PRESET_ID,
    );

    expect(select().props.value).toBe(DEFAULT_SEPARATION_PRESET_ID);
    trigger(select(), 'onChange', { target: { value: next.id } });
    expect(props.onPresetChange).toHaveBeenCalledWith(next.id);
  });

  it('keeps the tooltip trigger listeners on the native control', () => {
    const { select } = setup();

    expect(typeof select().props.onPointerenter).toBe('function');
    expect(typeof select().props.onFocusin).toBe('function');
  });

  it('locks selection without a track or while processing', async () => {
    const { props, select } = setup({ hasTrack: false });
    expect(select().props.disabled).toBe(true);

    props.hasTrack = true;
    props.inFlight = true;
    await nextTick();
    expect(select().props.disabled).toBe(true);
  });
});
