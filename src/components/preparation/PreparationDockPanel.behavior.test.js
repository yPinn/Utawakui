import { h, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import { useAppRightDock } from '../../composables/useAppRightDock.js';

const fixture = vi.hoisted(() => ({ scrollTo: vi.fn() }));
vi.mock('../layout/AppRightDockPanel.vue', () => ({
  default: {
    setup(_, { slots, expose }) {
      expose({ scrollTo: fixture.scrollTo });
      return () => h('section', [slots.identity?.(), slots.default?.()]);
    },
  },
}));
vi.mock('../import/ImportDockContent.vue', () => ({
  default: {
    props: ['active'],
    setup: (props) => () =>
      h('div', { id: 'import-content', active: props.active }),
  },
}));
vi.mock('../separation/SeparationDockContent.vue', () => ({
  default: {
    props: ['active', 'separationController'],
    setup: (props) => () =>
      h('div', { id: 'separation-content', active: props.active }),
  },
}));
vi.mock('../ui/UiTabs.vue', () => ({
  default: {
    props: ['items', 'activeId'],
    emits: ['update:activeId'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'nav',
          props.items.map((item) =>
            h('button', {
              id: item.id,
              selected: props.activeId === item.id,
              onClick: () => emit('update:activeId', item.id),
            }),
          ),
        ),
  },
}));
import PreparationDockPanel from './PreparationDockPanel.vue';
attachClientRender(
  PreparationDockPanel,
  './PreparationDockPanel.vue',
  import.meta.url,
);

describe('PreparationDockPanel shared selection', () => {
  it('syncs titlebar cycles and manual tabs, resets scroll, and retains both contents', async () => {
    const dock = useAppRightDock();
    dock.forgetSurface('preparation');
    dock.cyclePreparation();
    fixture.scrollTo.mockClear();
    const owner = {
      setup: () => () =>
        h(PreparationDockPanel, {
          active: dock.isExpanded.value,
          activePreparationTab: dock.preparationTab.value,
          'onUpdate:activePreparationTab': dock.selectPreparationTab,
          separationController: {},
        }),
    };
    const { root, app } = mount(owner);
    const node = (id) => findAll(root, (n) => n.props.id === id)[0];
    const originalImport = node('import-content');
    const originalSeparation = node('separation-content');
    expect(originalImport.props.active).toBe(true);
    expect(originalSeparation.props.active).toBe(false);

    dock.cyclePreparation();
    await nextTick();
    expect(node('separation').props.selected).toBe(true);
    expect(originalSeparation.props.active).toBe(true);
    expect(originalImport.props.active).toBe(false);
    expect(fixture.scrollTo).toHaveBeenLastCalledWith({ top: 0 });

    trigger(node('import'), 'onClick');
    await nextTick();
    expect(dock.preparationTab.value).toBe('import');
    expect(dock.preparationActionLabel.value).toBe('切換伴奏處理');
    expect(node('import').props.selected).toBe(true);
    trigger(node('separation'), 'onClick');
    await nextTick();
    dock.cyclePreparation();
    await nextTick();
    expect(originalImport.props.active).toBe(false);
    expect(originalSeparation.props.active).toBe(false);
    dock.cyclePreparation();
    await nextTick();
    expect(node('import-content')).toBe(originalImport);
    expect(node('separation-content')).toBe(originalSeparation);
    expect(node('import').props.selected).toBe(true);
    expect(originalImport.props.active).toBe(true);
    expect(fixture.scrollTo).toHaveBeenCalledTimes(4);
    app.unmount();
    dock.forgetSurface('preparation');
  });
});
