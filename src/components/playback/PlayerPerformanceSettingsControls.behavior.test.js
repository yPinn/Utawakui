import { describe, expect, it, vi } from 'vitest';
import Controls from './PlayerPerformanceSettingsControls.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

for (const [component, file] of [
  [Controls, './PlayerPerformanceSettingsControls.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiIconButton, '../ui/UiIconButton.vue'],
  [UiActionMenu, '../ui/UiActionMenu.vue'],
  [UiSeparator, '../ui/UiSeparator.vue'],
  [UiTooltipSurface, '../ui/tooltip/UiTooltipSurface.vue'],
])
  attachClientRender(component, file, import.meta.url);

function fixture(extra = {}) {
  const action = vi.fn();
  const mounted = mount(Controls, {
    state: {
      hasTrack: true,
      selectedSlot: 2,
      savedSlots: [true, true, false],
      ...extra,
    },
    onAction: action,
  });
  const slots = findAll(
    mounted.root,
    (node) => node.type === 'button' && 'aria-pressed' in node.props,
  );
  return { ...mounted, action, slots };
}
const contextmenu = (node) =>
  trigger(node, 'onContextmenu', {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });

describe('set button right-click reset', () => {
  it('addresses the right-clicked set for both selected and inactive buttons', () => {
    const f = fixture();
    contextmenu(f.slots[0]);
    contextmenu(f.slots[1]);
    expect(f.action.mock.calls).toEqual([
      [{ kind: 'resetSlot', slot: 1 }],
      [{ kind: 'resetSlot', slot: 2 }],
    ]);
    f.app.unmount();
  });
  it.each([{ hasTrack: false }, { busy: true }])(
    'does not reset disabled controls: %j',
    (extra) => {
      const f = fixture(extra);
      contextmenu(f.slots[1]);
      expect(f.action).not.toHaveBeenCalled();
      f.app.unmount();
    },
  );
});
