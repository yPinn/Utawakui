import { h, nextTick } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';
import Button from './PanelViewButton.vue';
import { usePanelView } from '../../composables/usePanelView.js';
vi.mock('../ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'disabled'],
    setup: (p) => () =>
      h('button', { 'aria-label': p.label, disabled: p.disabled }, p.label),
  },
}));
attachClientRender(Button, './PanelViewButton.vue', import.meta.url);
let app;
afterEach(() => {
  app?.unmount();
  usePanelView().reset();
});
it('uses the same visible button for maximizing and restoring the selected panel', async () => {
  const view = usePanelView();
  view.register('workspace', {
    element: { isConnected: true, focus: vi.fn() },
    label: '主工作區',
  });
  const mounted = mount(Button);
  app = mounted.app;
  const button = findAll(mounted.root, (n) => n.type === 'button')[0];
  expect(button.props['aria-label']).toBe('放大面板');
  trigger(button, 'onClick');
  await nextTick();
  expect(view.maximizedId.value).toBe('workspace');
  expect(button.props['aria-label']).toBe('還原面板');
  trigger(button, 'onClick');
  await nextTick();
  expect(view.maximizedId.value).toBeNull();
  expect(button.props['aria-label']).toBe('放大面板');
});
