import { h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Board from './PerformanceSessionBoard.vue';
import UiChip from '../ui/UiChip.vue';
vi.mock('./PerformanceSessionHistoryTools.vue', () => ({
  default: {
    setup(_, { slots }) {
      return () => h('div', slots.default?.());
    },
  },
}));
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
describe('session board tab ownership', () => {
  it('always shows tabs, switches full-width panels and retains their mounted content', async () => {
    vi.stubGlobal('document', {
      documentElement: hostNode('html'),
      activeElement: null,
    });
    const mounted = mount(
      Board,
      { historyItems: [{ itemId: 'one', progress: 'completed' }] },
      {
        pending: () =>
          h('button', { class: 'pending-action' }, 'Pending action'),
      },
    );
    const panel = (id) =>
      findAll(
        mounted.root,
        (n) => n.props.id === `session-board-${id}-panel`,
      )[0];
    const pending = panel('pending'),
      history = panel('history');
    const tabs = () => findAll(mounted.root, (n) => n.props.role === 'tab');
    expect(tabs()).toHaveLength(2);
    expect(tabs().map((t) => t.props['aria-selected'])).toEqual([true, false]);
    expect(pending.style.display).not.toBe('none');
    expect(history.style.display).toBe('none');
    trigger(tabs()[1], 'onClick');
    await nextTick();
    expect(panel('pending')).toBe(pending);
    expect(panel('history')).toBe(history);
    expect(pending.style.display).toBe('none');
    expect(history.style.display).not.toBe('none');
    trigger(tabs()[0], 'onClick');
    await nextTick();
    expect(pending.style.display).not.toBe('none');
    expect(history.style.display).toBe('none');
    expect(tabs()).toHaveLength(2);
    mounted.app.unmount();
  });
});
