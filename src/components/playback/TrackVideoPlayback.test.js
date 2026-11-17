import { markRaw, nextTick } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import TrackVideoPlayback from './TrackVideoPlayback.vue';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../ui/uiTestHost.js';

const { samplePlaybackClock } = vi.hoisted(() => ({
  samplePlaybackClock: vi.fn(),
}));
vi.mock('../../composables/usePlayer.js', () => ({
  usePlayer: () => ({ state: { track: { id: 'song' } }, samplePlaybackClock }),
}));

afterEach(() => vi.unstubAllGlobals());

it('shows a synced background only for a ready in-range frame and hides it on failure', async () => {
  attachClientRender(
    TrackVideoPlayback,
    './TrackVideoPlayback.vue',
    import.meta.url,
  );
  let tick;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    tick = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const onVisibilityChange = vi.fn();
  const sample = {
    trackId: 'song',
    phase: 'paused',
    continuityRevision: 0,
    positionMs: 2000,
    rate: 1,
  };
  samplePlaybackClock.mockReturnValue(sample);
  const { root, app } = mount(TrackVideoPlayback, {
    asset: {
      url: 'utawakui-media://track-video/song/revision',
      offsetMs: -1000,
    },
    background: true,
    onVisibilityChange,
  });
  const [media] = findAll(root, (node) => node.type === 'video');
  markRaw(media);
  Object.assign(media, {
    paused: true,
    readyState: 1,
    duration: 8,
    currentTime: 0,
    playbackRate: 1,
    pause: vi.fn(() => {
      media.paused = true;
    }),
    play: vi.fn(async () => {
      media.paused = false;
    }),
    removeEventListener: vi.fn(),
  });
  await nextTick();
  expect(media.props.muted).toBe('');
  tick();
  expect(media.currentTime).toBe(1);
  expect(onVisibilityChange).not.toHaveBeenCalled();

  media.readyState = 2;
  tick();
  expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
  Object.assign(sample, { phase: 'playing', rate: 1.25 });
  tick();
  expect(media.playbackRate).toBe(1.25);
  expect(media.play).toHaveBeenCalledOnce();

  Object.assign(sample, { positionMs: 9000, continuityRevision: 1 });
  tick();
  expect(media.paused).toBe(true);
  expect(onVisibilityChange).toHaveBeenLastCalledWith(false);

  Object.assign(sample, { positionMs: 3000, continuityRevision: 2 });
  tick();
  expect(media.currentTime).toBe(2);
  expect(onVisibilityChange).toHaveBeenLastCalledWith(true);
  trigger(media, 'onError');
  await nextTick();
  expect(onVisibilityChange).toHaveBeenLastCalledWith(false);
  expect(findAll(root, (node) => node.type === 'video')).toHaveLength(0);
  app.unmount();
});
