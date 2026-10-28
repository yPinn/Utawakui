import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import { createPanelViewState, usePanelViewTarget } from './usePanelView.js';
const element = () => ({
  isConnected: true,
  focus: vi.fn(),
  contains: vi.fn(() => false),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
const event = (key = '`', extra = {}) => ({
  key,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...extra,
});
afterEach(() => vi.unstubAllGlobals());
it('rejects disconnected targets, ignores stale unregisters and can switch explicitly to a nested panel', () => {
  const view = createPanelViewState(),
    old = element(),
    fresh = element(),
    wave = element();
  expect(view.toggle()).toBe(false);
  const unregister = view.register('workspace', {
    element: old,
    label: '主工作區',
  });
  view.register('workspace', { element: fresh, label: '主工作區' });
  unregister();
  expect(view.hasTarget('workspace')).toBe(true);
  fresh.isConnected = false;
  expect(view.toggle()).toBe(false);
  fresh.isConnected = true;
  view.toggle();
  view.register('waveform', {
    element: wave,
    label: '原音訊波形',
    overlay: true,
  });
  view.toggle('waveform');
  expect(view.maximizedId.value).toBe('waveform');
  expect(fresh.focus).not.toHaveBeenCalled();
  view.reset();
  expect(view.currentId.value).toBeNull();
  expect(view.hasTarget('waveform')).toBe(false);
});
it('maximizes only the selected live panel, toggles back and preserves the registered DOM/focus', () => {
  const view = createPanelViewState(),
    workspace = element(),
    dock = element(),
    focus = element();
  workspace.contains.mockImplementation((e) => e === focus);
  view.register('workspace', { element: workspace, label: '主工作區' });
  view.register('dock', { element: dock, label: '播放佇列' });
  view.select('workspace', focus);
  expect(view.toggle()).toBe(true);
  expect(view.maximizedId.value).toBe('workspace');
  view.select('dock');
  expect(view.currentId.value).toBe('workspace');
  expect(view.toggle()).toBe(true);
  expect(view.maximizedId.value).toBeNull();
  expect(focus.focus).toHaveBeenCalled();
  view.select('dock');
  view.toggle();
  expect(view.currentLabel.value).toBe('播放佇列');
});
it('yields text, modifiers, composing, repeat, handled input, recording and unrelated dialogs/menus', () => {
  const view = createPanelViewState();
  const panel = element();
  view.register('workspace', { element: panel, label: '主工作區' });
  for (const extra of [
    { target: { tagName: 'INPUT' } },
    { target: { isContentEditable: true } },
    { composedPath: () => [{ tagName: 'INPUT' }] },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
    { shiftKey: true },
    { isComposing: true },
    { keyCode: 229 },
    { getModifierState: () => true },
    { repeat: true },
    { defaultPrevented: true },
  ]) {
    const key = event('`', extra);
    expect(view.handleKeydown(key)).toBe(false);
    expect(key.preventDefault).not.toHaveBeenCalled();
  }
  expect(view.handleKeydown(event(), { recording: true })).toBe(false);
  vi.stubGlobal('document', { querySelectorAll: () => [{}] });
  expect(view.handleKeydown(event())).toBe(false);
  vi.stubGlobal('document', { querySelectorAll: () => [] });
  const key = event();
  expect(view.handleKeydown(key)).toBe(true);
  expect(key.preventDefault).toHaveBeenCalledOnce();
  expect(view.handleKeydown(event('Escape'))).toBe(true);
  expect(view.maximizedId.value).toBeNull();
  expect(view.handleKeydown(event('Escape'))).toBe(false);
});
it('allows its own waveform popover but not a second overlay and restores when unregistered', () => {
  const view = createPanelViewState(),
    panel = element();
  const unregister = view.register('waveform', {
    element: panel,
    label: '原音訊波形',
    overlay: true,
  });
  vi.stubGlobal('document', { querySelectorAll: () => [panel] });
  expect(view.handleKeydown(event())).toBe(true);
  vi.stubGlobal('document', { querySelectorAll: () => [panel, {}] });
  expect(view.handleKeydown(event('Escape'))).toBe(false);
  unregister();
  expect(view.maximizedId.value).toBeNull();
  expect(view.currentId.value).toBeNull();
  expect(view.toggle()).toBe(false);
});
it('releases focus/pointer registrations and temporary maximization on context changes, closure and unmount', async () => {
  const view = createPanelViewState(),
    node = element(),
    target = shallowRef(node),
    enabled = shallowRef(true),
    context = shallowRef('source-a'),
    scope = effectScope();
  scope.run(() =>
    usePanelViewTarget({
      id: 'waveform',
      element: target,
      enabled,
      context,
      label: '原音訊波形',
      overlay: true,
      owner: view,
    }),
  );
  await nextTick();
  expect(node.addEventListener).toHaveBeenCalledTimes(2);
  view.toggle();
  context.value = 'source-b';
  await nextTick();
  expect(view.maximizedId.value).toBeNull();
  view.select('waveform');
  view.toggle();
  enabled.value = false;
  await nextTick();
  expect(view.maximizedId.value).toBeNull();
  enabled.value = true;
  await nextTick();
  view.toggle();
  scope.stop();
  expect(view.maximizedId.value).toBeNull();
  expect(node.removeEventListener).toHaveBeenCalled();
});
