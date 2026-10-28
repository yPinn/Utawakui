import { effectScope, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => {
  vi.stubGlobal('window', { innerWidth: 1440 });
  return { mount: vi.fn(), dispose: vi.fn() };
});
vi.mock('vue', async (original) => ({
  ...(await original()),
  onMounted: lifecycle.mount,
  onScopeDispose: lifecycle.dispose,
}));
import { useShellLayout } from './useShellLayout.js';
import { useSidebarWidth } from './useSidebarWidth.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Shell layout DOM boundary', () => {
  it('observes actual width and tokens, returns hidden focus to disclosure, and disconnects', async () => {
    vi.stubGlobal('window', { innerWidth: 1440 });
    const focus = vi.fn();
    const focused = { getClientRects: () => [] };
    const sidebar = {
      contains: (node) => node === focused,
      querySelector: () => ({ focus }),
    };
    const root = ref({ clientWidth: 1440, querySelector: () => sidebar });
    const documentRoot = {};
    vi.stubGlobal('document', {
      documentElement: documentRoot,
      activeElement: focused,
    });
    const tokens = {
      '--ui-shell-workspace-min-inline-size': '40rem',
      '--ui-shell-layout-recovery-inline-size': '4rem',
      '--ui-shell-edge-inset-inline': '8px',
      '--ui-shell-workspace-inline-start': '12px',
      '--ui-space-3': '0.75rem',
    };
    vi.stubGlobal('getComputedStyle', (node) =>
      node === documentRoot
        ? { fontSize: '16px' }
        : node === focused
          ? { visibility: 'hidden' }
          : { getPropertyValue: (name) => tokens[name] },
    );
    let resize;
    const observe = vi.fn(),
      disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback) {
          resize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const preference = useSidebarWidth();
    preference.setWidth(256);
    const scope = effectScope();
    const shell = scope.run(() => useShellLayout(root, ref(true)));
    lifecycle.mount.mock.calls.at(-1)[0]();
    expect(observe).toHaveBeenCalledWith(root.value);
    root.value.clientWidth = 960;
    resize();
    await nextTick();
    await nextTick();
    expect(shell.layout.value.dockBayWidth).toBe(272);
    expect(focus).toHaveBeenCalledOnce();
    root.value.clientWidth = 1440;
    resize();
    await nextTick();
    focused.getClientRects = () => [{}];
    root.value.clientWidth = 960;
    resize();
    await nextTick();
    await nextTick();
    expect(focus).toHaveBeenCalledTimes(2);
    root.value.clientWidth = 1440;
    resize();
    await nextTick();
    document.activeElement = {};
    root.value.clientWidth = 960;
    resize();
    await nextTick();
    expect(focus).toHaveBeenCalledTimes(2);
    tokens['--ui-space-3'] = 'invalid';
    root.value.clientWidth = 1920;
    resize();
    expect(shell.layout.value.dockBayWidth).toBe(272);
    root.value = null;
    resize();
    lifecycle.dispose.mock.calls.at(-1)[0]();
    expect(disconnect).toHaveBeenCalledOnce();
    scope.stop();
    preference.setWidth(64);
  });
});
