import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import UiTabs from '../ui/UiTabs.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import DemoCandidateTabs from './DemoCandidateTabs.vue';
const navigationSource = readFileSync(
  new URL('./DemoNavigation.vue', import.meta.url),
  'utf8',
);
for (const [component, filename] of [
  [DemoCandidateTabs, './DemoCandidateTabs.vue'],
  [UiTabs, '../ui/UiTabs.vue'],
  [UiScrollRegion, '../ui/UiScrollRegion.vue'],
]) {
  attachClientRender(component, filename, import.meta.url);
}
describe('DemoTabsAppearance', () => {
  it('replaces only the tabs sample with the staged appearance review', () => {
    expect(navigationSource).toContain(
      "import DemoTabsAppearance from './DemoTabsAppearance.vue';",
    );
    expect(navigationSource).toContain(
      '<DemoTabsAppearance v-if="section.key === \'tabs\'" />',
    );
    expect(navigationSource).not.toContain('const PANEL_TABS');
    expect(navigationSource).not.toContain('const BAR_TABS');
  });
  it('reuses UiTabs roving focus and skips disabled tabs', async () => {
    const update = vi.fn();
    const { app, root } = mount(DemoCandidateTabs, {
      items: [
        {
          id: 'library',
          label: '曲庫',
        },
        {
          id: 'locked',
          label: '未開放',
          disabled: true,
        },
        {
          id: 'queue',
          label: '佇列',
        },
      ],
      activeId: 'library',
      ariaLabel: '工作區',
      tabIdPrefix: 'candidate-workspace',
      panelIdPrefix: 'candidate-workspace',
      'data-contract': 'native-forwarding',
      'onUpdate:activeId': update,
    });
    const tablist = findAll(root, (node) => node.props.role === 'tablist')[0];
    const tabs = findAll(root, (node) => node.props.role === 'tab');
    expect(tablist.props).toMatchObject({
      'aria-label': '工作區',
      'data-contract': 'native-forwarding',
    });
    expect(tabs[0].props).toMatchObject({
      id: 'candidate-workspace-library-tab',
      'aria-controls': 'candidate-workspace-library-panel',
      'aria-selected': true,
      tabindex: 0,
    });
    expect(tabs[1].props.disabled).toBe(true);
    const event = {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    };
    trigger(tabs[0], 'onKeydown', event);
    await nextTick();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith('queue');
    expect(tabs[2].focus).toHaveBeenCalledOnce();
    app.unmount();
  });
});
