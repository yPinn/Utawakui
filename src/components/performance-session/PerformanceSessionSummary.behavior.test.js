import { h, nextTick } from 'vue';
import {
  attachClientRender,
  mount,
  findAll,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import { expect, it, vi } from 'vitest';
import PerformanceSessionSummary from './PerformanceSessionSummary.vue';
const fixture = vi.hoisted(() => ({
  plan: { state: { isInitialized: true, plan: { source: null, items: [] } } },
  library: { state: { tracks: [] } },
  playback: { currentItem: { value: null } },
}));
vi.mock('../../composables/usePerformanceSessionPlan.js', () => ({
  usePerformanceSessionPlan: () => fixture.plan,
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => fixture.library,
}));
vi.mock('../../composables/usePerformanceSessionPlayback.js', () => ({
  usePerformanceSessionPlayback: () => fixture.playback,
}));
vi.mock('../ui/UiPopover.vue', () => ({
  default: {
    props: ['open'],
    setup:
      (props, { slots, emit }) =>
      () =>
        h('div', [
          slots.trigger({ triggerProps: { 'aria-expanded': props.open } }),
          props.open
            ? h('section', { role: 'dialog' }, [
                slots.default(),
                h('button', {
                  'aria-label': 'Close',
                  onClick: () => emit('update:open', false),
                }),
              ])
            : null,
        ]),
  },
}));
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label'],
    setup:
      (props, { attrs }) =>
      () =>
        h('button', attrs, props.label),
  },
}));
vi.mock('../ui/UiHint.vue', () => ({
  default: {
    setup:
      (_, { slots }) =>
      () =>
        h('p', slots.default()),
  },
}));
attachClientRender(
  PerformanceSessionSummary,
  './PerformanceSessionSummary.vue',
  import.meta.url,
);
it('opens unknown duration and terminal details through one shared entry, and closes without losing totals', async () => {
  fixture.plan.state.plan = {
    source: null,
    items: [
      { itemId: 'one', mode: 'manual', progress: 'skipped' },
      { itemId: 'two', mode: 'manual', progress: 'interrupted' },
    ],
  };
  const view = mount(PerformanceSessionSummary);
  const text = () => textContent(view.root);
  expect(text()).toContain('共 2 項');
  expect(text()).not.toContain('略過 1');
  const entry = findAll(view.root, (n) => n.type === 'button')[0];
  trigger(entry, 'onClick');
  await nextTick();
  for (const fact of ['另 2 項時長未知', '略過 1', '中止 1'])
    expect(text()).toContain(fact);
  expect(findAll(view.root, (n) => n.props.role === 'dialog')).toHaveLength(1);
  trigger(
    findAll(view.root, (n) => n.props['aria-label'] === 'Close')[0],
    'onClick',
  );
  await nextTick();
  expect(text()).not.toContain('略過 1');
  expect(text()).toContain('共 2 項');
  view.app.unmount();
});
