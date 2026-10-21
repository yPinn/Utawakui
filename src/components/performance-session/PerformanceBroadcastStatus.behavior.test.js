import { nextTick, reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PerformanceBroadcastStatus from './PerformanceBroadcastStatus.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
} from '../ui/uiTestHost.js';

const fixture = vi.hoisted(() => ({ state: null }));
vi.mock('../../composables/useObsIntegration.js', () => ({
  useObsIntegration: () => ({ state: fixture.state }),
}));
attachClientRender(
  PerformanceBroadcastStatus,
  './PerformanceBroadcastStatus.vue',
  import.meta.url,
);
beforeEach(() => {
  fixture.state = reactive({
    statusReadError: '',
    observed: {
      lifecycle: 'ready',
      streaming: { active: false },
      recording: { active: false },
    },
  });
});

describe('inline performance broadcast status', () => {
  it('renders only observed active labels, with no empty status placeholder', async () => {
    const view = mount(PerformanceBroadcastStatus);
    const statuses = () => findAll(view.root, (n) => n.props.role === 'status');
    expect(statuses()).toHaveLength(0);
    for (const [live, recording, expected] of [
      [true, false, 'LIVE'],
      [true, true, 'LIVEREC'],
      [false, true, 'REC'],
      [false, false, ''],
    ]) {
      fixture.state.observed.streaming.active = live;
      fixture.state.observed.recording.active = recording;
      await nextTick();
      expect(textContent(view.root)).toBe(expected);
      expect(statuses()).toHaveLength(expected ? 1 : 0);
    }
    view.app.unmount();
  });
  it.each(['disabled', 'connecting', 'disconnected', 'error'])(
    'suppresses stale active flags while %s',
    async (lifecycle) => {
      fixture.state.observed.streaming.active = true;
      fixture.state.observed.recording.active = true;
      const view = mount(PerformanceBroadcastStatus);
      expect(textContent(view.root)).toBe('LIVEREC');
      fixture.state.observed.lifecycle = lifecycle;
      await nextTick();
      expect(textContent(view.root)).toBe('');
      expect(findAll(view.root, (n) => n.props.role === 'status')).toHaveLength(
        0,
      );
      view.app.unmount();
    },
  );
  it('accepts degraded observed status but clears unreadable status', async () => {
    fixture.state.observed.lifecycle = 'degraded';
    fixture.state.observed.streaming.active = true;
    const view = mount(PerformanceBroadcastStatus);
    expect(textContent(view.root)).toBe('LIVE');
    fixture.state.statusReadError = '無法讀取狀態';
    await nextTick();
    expect(textContent(view.root)).toBe('');
    view.app.unmount();
  });
});
