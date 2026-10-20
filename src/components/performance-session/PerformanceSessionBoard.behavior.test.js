import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Board from './PerformanceSessionBoard.vue';
import UiChip from '../ui/UiChip.vue';
import {
  attachClientRender,
  findAll,
  hostNode,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
vi.mock('./PerformanceSessionPlanList.vue', () => ({
  default: {
    setup: () => () =>
      h('button', { class: 'history-action' }, 'History action'),
  },
}));
vi.mock('../ui/UiTabs.vue', () => ({
  default: {
    props: ['items', 'activeId'],
    setup(props, { emit }) {
      return () =>
        h(
          'div',
          { role: 'tablist' },
          props.items.map((item) =>
            h(
              'button',
              {
                role: 'tab',
                'aria-selected': props.activeId === item.id,
                onClick: () => emit('update:activeId', item.id),
              },
              item.label,
            ),
          ),
        );
    },
  },
}));
attachClientRender(Board, './PerformanceSessionBoard.vue', import.meta.url);
attachClientRender(UiChip, '../ui/UiChip.vue', import.meta.url);
afterEach(() => vi.unstubAllGlobals());
describe('session board responsive ownership', () => {
  it('switches panels from actual width, retains focused history during reflow, and disconnects on unmount', async () => {
    let resize;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          resize = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    vi.stubGlobal('getComputedStyle', () => ({ fontSize: '16px' }));
    const doc = { documentElement: hostNode('html'), activeElement: null };
    vi.stubGlobal('document', doc);
    const mounted = mount(
      Board,
      { historyItems: [{ itemId: 'one', progress: 'completed' }] },
      {
        pending: () =>
          h('button', { class: 'pending-action' }, 'Pending action'),
      },
    );
    await nextTick();
    const history = findAll(
      mounted.root,
      (n) => n.props.id === 'session-board-history-panel',
    )[0];
    // The fake host is a plain object, so use the readonly template-ref view
    // that contains() sees; native DOM elements are never proxied by Vue.
    doc.activeElement =
      mounted.app._instance.subTree.component.setupState.history.children[0];
    resize([{ contentRect: { width: 600 } }]);
    await nextTick();
    const tabs = () => findAll(mounted.root, (n) => n.props.role === 'tab');
    expect(tabs().map((t) => t.props['aria-selected'])).toEqual([false, true]);
    expect(history.style.display).not.toBe('none');
    trigger(tabs()[0], 'onClick');
    await nextTick();
    expect(history.style.display).toBe('none');
    resize([{ contentRect: { width: 1000 } }]);
    await nextTick();
    expect(tabs()).toHaveLength(0);
    expect(history.style.display).not.toBe('none');
    mounted.app.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
