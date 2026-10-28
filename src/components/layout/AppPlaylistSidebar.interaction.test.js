import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({
    tracksById: ref(new Map()),
    state: { isLoading: false },
  }),
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => ({ openLibraryContent: vi.fn() }),
}));
vi.mock('../../composables/usePlaylists.js', () => ({
  usePlaylists: () => ({
    state: { libraryView: 'all' },
    setLibraryView: vi.fn(),
  }),
}));
vi.mock('../../composables/usePlaylistActions.js', () => ({
  usePlaylistActions: () => ({ editDetailsPlaylist: ref(null) }),
}));
vi.mock('../playlists/PlaylistSidebar.vue', () => ({
  default: { render: () => null },
}));
vi.mock('../playlists/PlaylistDetailsModal.vue', () => ({
  default: { render: () => null },
}));
import AppPlaylistSidebar from './AppPlaylistSidebar.vue';
attachClientRender(
  AppPlaylistSidebar,
  './AppPlaylistSidebar.vue',
  import.meta.url,
);

function setup(expanded) {
  const toggle = vi.fn();
  const rendered = mount(AppPlaylistSidebar, {
    expanded,
    onToggleExpanded: toggle,
  });
  const handle = findAll(rendered.root, (n) => n.props.role === 'separator')[0];
  const listeners = new Map();
  const target = {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    addEventListener: (name, cb) => listeners.set(name, cb),
    removeEventListener: (name) => listeners.delete(name),
  };
  const start = () =>
    trigger(handle, 'onPointerdown', {
      clientX: 100,
      pointerId: 1,
      currentTarget: target,
      preventDefault: vi.fn(),
    });
  return { ...rendered, toggle, handle, listeners, start };
}

describe('Sidebar boundary axis', () => {
  it('switches immediately in both directions during one held drag with a fresh reversal threshold', () => {
    const { app, toggle, listeners, start } = setup(true);
    start();
    listeners.get('pointermove')({ clientX: 77 });
    expect(toggle).not.toHaveBeenCalled();
    listeners.get('pointermove')({ clientX: 76 });
    expect(toggle).toHaveBeenCalledOnce();
    listeners.get('pointermove')({ clientX: 40 });
    listeners.get('pointermove')({ clientX: 63 });
    expect(toggle).toHaveBeenCalledOnce();
    listeners.get('pointermove')({ clientX: 64 });
    expect(toggle).toHaveBeenCalledTimes(2);
    listeners.get('pointermove')({ clientX: 90 });
    listeners.get('pointermove')({ clientX: 67 });
    expect(toggle).toHaveBeenCalledTimes(2);
    listeners.get('pointermove')({ clientX: 66 });
    expect(toggle).toHaveBeenCalledTimes(3);
    listeners.get('pointerup')();
    expect(toggle).toHaveBeenCalledTimes(3);
    app.unmount();
  });

  it('expands immediately and keeps an already applied state when the drag is cancelled', () => {
    const { app, toggle, listeners, start } = setup(false);
    start();
    listeners.get('pointermove')({ clientX: 123 });
    expect(toggle).not.toHaveBeenCalled();
    listeners.get('pointermove')({ clientX: 124 });
    expect(toggle).toHaveBeenCalledOnce();
    listeners.get('pointercancel')();
    expect(toggle).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('does not switch on a short or cancelled pre-threshold gesture', () => {
    const { app, toggle, listeners, start } = setup(false);
    start();
    listeners.get('pointermove')({ clientX: 123 });
    listeners.get('pointercancel')();
    expect(toggle).not.toHaveBeenCalled();
    start();
    listeners.get('pointermove')({ clientX: 120 });
    listeners.get('pointermove')({ clientX: 110 });
    listeners.get('pointerup')();
    expect(toggle).not.toHaveBeenCalled();
    start();
    listeners.get('pointermove')({ clientX: 103 });
    listeners.get('pointerup')();
    expect(toggle).not.toHaveBeenCalled();
    start();
    listeners.get('pointermove')({ clientX: 124 });
    listeners.get('pointerup')();
    expect(toggle).toHaveBeenCalledOnce();
    app.unmount();
  });

  it('keeps resize feedback through the snap without adding a guide line and clears it on release', async () => {
    const { app, toggle, overlayHost, listeners, start } = setup(true);
    const feedback = () =>
      findAll(
        overlayHost,
        (n) => n.props.class === 'app-playlist-sidebar__drag-feedback',
      );
    start();
    listeners.get('pointermove')({ clientX: 94 });
    await nextTick();
    expect(toggle).not.toHaveBeenCalled();
    expect(feedback()).toHaveLength(1);
    listeners.get('pointermove')({ clientX: 76 });
    await nextTick();
    expect(toggle).toHaveBeenCalledOnce();
    expect(
      findAll(
        overlayHost,
        (n) => n.props.class === 'app-playlist-sidebar__drag-guide',
      ),
    ).toHaveLength(0);
    expect(feedback()).toHaveLength(1);
    listeners.get('pointerup')();
    await nextTick();
    expect(feedback()).toHaveLength(0);
    app.unmount();
  });

  it('removes drag feedback on cancellation or unmount', async () => {
    const { app, overlayHost, listeners, start } = setup(false);
    const feedback = () =>
      findAll(
        overlayHost,
        (n) => n.props.class === 'app-playlist-sidebar__drag-feedback',
      );
    start();
    listeners.get('pointermove')({ clientX: 110 });
    await nextTick();
    expect(feedback()).toHaveLength(1);
    listeners.get('pointercancel')();
    await nextTick();
    expect(feedback()).toHaveLength(0);
    start();
    listeners.get('pointermove')({ clientX: 124 });
    await nextTick();
    expect(feedback()).toHaveLength(1);
    app.unmount();
    expect(feedback()).toHaveLength(0);
  });

  it('keeps double-click and keyboard actions on the same two-state separator', () => {
    const { app, toggle, handle } = setup(false);
    for (const key of ['ArrowLeft', 'Home', 'Escape'])
      trigger(handle, 'onKeydown', { key, preventDefault: vi.fn() });
    expect(toggle).not.toHaveBeenCalled();
    for (const key of ['ArrowRight', 'End', 'Enter', ' '])
      trigger(handle, 'onKeydown', { key, preventDefault: vi.fn() });
    trigger(handle, 'onDblclick');
    expect(toggle).toHaveBeenCalledTimes(5);
    expect(handle.props['aria-valuenow']).toBe(64);
    app.unmount();
  });
});
