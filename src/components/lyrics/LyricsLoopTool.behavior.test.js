import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Tool from './LyricsLoopTool.vue';
import { mount } from '../ui/uiTestHost.js';
const f = vi.hoisted(() => ({}));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ state: { track: { id: 'playing' } } }),
}));
vi.mock('../../composables/usePlayerPractice.js', () => ({
  usePlayerPractice: () => f.owner,
}));
beforeEach(() => {
  f.owner = {
    state: {},
    canEnable: ref(true),
    running: ref(false),
    unavailableReason: ref(''),
    capture: vi.fn(),
    clear: vi.fn(),
    toggle: vi.fn(),
    setGap: vi.fn(),
    setPoint: vi.fn(),
  };
});
describe('lyrics loop context', () => {
  it.each(['playing', 'another'])(
    'only marks the displayed playing track: %s',
    (id) => {
      const { app } = mount(
        { ...Tool, render: () => null },
        { contextTrackId: id },
      );
      const vm = app._instance.subTree.component.setupState;
      vm.action({ kind: 'capture', point: 'a' });
      expect(f.owner.capture).toHaveBeenCalledTimes(id === 'playing' ? 1 : 0);
      vm.action({ kind: 'clear' });
      expect(f.owner.clear).toHaveBeenCalledTimes(id === 'playing' ? 1 : 0);
      app.unmount();
    },
  );
});
