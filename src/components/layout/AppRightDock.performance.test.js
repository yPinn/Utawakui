import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppRightDock from './AppRightDock.vue';

const fixture = vi.hoisted(() => ({ state: null }));
vi.mock('../../composables/useObsIntegration.js', () => ({
  useObsIntegration: () => fixture,
}));
beforeEach(() => {
  fixture.state = {
    observed: {
      lifecycle: 'ready',
      streaming: { active: false },
      recording: { active: false },
    },
  };
});
const render = (performance = true) =>
  renderToString(
    createSSRApp(AppRightDock, {
      expanded: true,
      contentId: 'dock',
      performance,
    }),
  );
describe('performance Dock broadcast identity', () => {
  it('distinguishes local performance mode without claiming LIVE', async () => {
    const html = await render();
    expect(html).toContain('app-right-dock--performance');
    expect(html).not.toContain('app-right-dock--live');
  });
  it('uses the observed stream and recording state without changing the general Queue', async () => {
    fixture.state.observed.streaming.active = true;
    fixture.state.observed.recording.active = true;
    expect(await render()).toContain('app-right-dock--live');
    expect(await render()).toContain('app-right-dock--recording');
    expect(await render(false)).not.toMatch(
      /app-right-dock--(?:live|recording|performance)/,
    );
  });
  it.each(['disabled', 'connecting', 'disconnected', 'error'])(
    'does not display stale LIVE when %s',
    async (lifecycle) => {
      fixture.state.observed.lifecycle = lifecycle;
      fixture.state.observed.streaming.active = true;
      fixture.state.observed.recording.active = true;
      expect(await render()).not.toMatch(/app-right-dock--(?:live|recording)/);
    },
  );
  it('keeps confirmed outputs during a degraded ready connection', async () => {
    fixture.state.observed.lifecycle = 'degraded';
    fixture.state.observed.recording.active = true;
    expect(await render()).toContain('app-right-dock--recording');
    expect(await render()).not.toContain('app-right-dock--live');
  });
  it('clears LIVE when a status read failed even if the last snapshot was active', async () => {
    fixture.state.statusReadError = '讀取失敗';
    fixture.state.observed.streaming.active = true;
    expect(await render()).not.toContain('app-right-dock--live');
  });
});
