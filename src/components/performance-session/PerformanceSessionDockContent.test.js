import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import DockContent from './PerformanceSessionDockContent.vue';
const fixture = vi.hoisted(() => ({
  activeView: { value: 'performance' },
  performanceTool: { value: 'session' },
}));
vi.mock('../../composables/useAppView.js', () => ({
  useAppView: () => fixture,
}));
vi.mock('../../composables/usePerformanceSessionPlan.js', () => ({
  usePerformanceSessionPlan: () => ({
    state: { plan: { items: [] }, isSaving: false },
    initialize: vi.fn(),
  }),
}));
vi.mock('../../composables/usePerformanceSessionPlayback.js', () => ({
  usePerformanceSessionPlayback: () => ({
    state: { continuous: false },
    currentItem: { value: null },
    pendingItems: { value: [] },
    ownsPlayback: { value: false },
    canStart: { value: true },
  }),
}));
vi.mock('../../composables/useAppRightDock.js', () => ({
  useAppRightDock: () => ({ arrangementTab: { value: 'pending' } }),
}));
vi.mock('../../composables/useLibrary.js', () => ({
  useLibrary: () => ({ state: { tracks: [] } }),
}));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ state: {} }),
}));
vi.mock('../../composables/useAppConfirmation.js', () => ({
  useAppConfirmation: () => ({ confirm: vi.fn() }),
}));
vi.mock('./PerformanceSessionCurrent.vue', () => ({
  default: { render: () => h('p', '目前播放控制') },
}));
vi.mock('./PerformanceSessionQueueList.vue', () => ({
  default: { render: () => h('p', '待唱清單') },
}));
const render = () => renderToString(createSSRApp(DockContent));
describe('Dock control ownership follows the visible session page', () => {
  it('keeps the list but omits duplicate playback and continuous controls on the page', async () => {
    fixture.activeView.value = 'performance';
    fixture.performanceTool.value = 'session';
    const html = await render();
    expect(html).toContain('待唱清單');
    expect(html).not.toContain('目前播放控制');
    expect(html).not.toContain('連續播放');
  });
  it.each([
    ['library', 'session'],
    ['performance', 'live-lyrics'],
  ])('retains cross-page controls at %s / %s', async (view, tool) => {
    fixture.activeView.value = view;
    fixture.performanceTool.value = tool;
    const html = await render();
    expect(html).toContain('目前播放控制');
    expect(html).toContain('連續播放');
    expect(html).toContain('待唱清單');
  });
});
