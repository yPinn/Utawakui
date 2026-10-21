import { ref, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SEPARATION_PRESET_ID } from '../constants/separationPresets.js';
import { useTrackSeparationAction } from './useTrackSeparationAction.js';
import { useAppNotifications } from './useAppNotifications.js';

afterEach(() => {
  const notifications = useAppNotifications();
  for (const item of notifications.items.value) notifications.clear(item.key);
});

function queueStatus(items = []) {
  return {
    status: items.length ? 'running' : 'idle',
    items,
  };
}

describe('useTrackSeparationAction', () => {
  it('projects only open work into queued track ids', () => {
    const queue = ref(
      queueStatus([
        { trackId: 'pending', status: 'pending' },
        { trackId: 'checking', status: 'checking' },
        { trackId: 'running', status: 'running' },
        { trackId: 'completed', status: 'completed' },
      ]),
    );
    const action = useTrackSeparationAction({
      separationController: { queue, error: shallowRef('') },
      tracksById: ref(new Map()),
    });

    expect([...action.vsQueuedTrackIds.value]).toEqual([
      'pending',
      'checking',
      'running',
    ]);
  });

  it('gates and enqueues one canonical library track with the default recipe', async () => {
    const enqueue = vi.fn().mockResolvedValue(queueStatus());
    const requireFeatureGate = vi.fn().mockResolvedValue(true);
    const track = { id: 'track-a', title: '第一首歌' };
    const action = useTrackSeparationAction({
      separationController: {
        queue: ref(null),
        error: shallowRef(''),
        enqueue,
      },
      tracksById: ref(new Map([[track.id, track]])),
      featureGateAccess: { requireFeatureGate },
    });

    await action.queueTrackForSeparation({ id: 'track-a' });

    expect(requireFeatureGate).toHaveBeenCalledWith(
      'audio-processing-flow',
      expect.objectContaining({
        label: '伴奏處理',
        message: '請先到設定啟用伴奏處理。',
        source: 'library',
        operation: 'enqueue-track',
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      ['track-a'],
      DEFAULT_SEPARATION_PRESET_ID,
      false,
    );
  });

  it('does not enqueue unknown, already ready, queued, or gate-blocked tracks', async () => {
    const enqueue = vi.fn();
    const requireFeatureGate = vi.fn().mockResolvedValue(false);
    const ready = { id: 'ready', hasSeparation: true };
    const queued = { id: 'queued' };
    const blocked = { id: 'blocked' };
    const action = useTrackSeparationAction({
      separationController: {
        queue: ref(queueStatus([{ trackId: queued.id, status: 'pending' }])),
        error: shallowRef(''),
        enqueue,
      },
      tracksById: ref(
        new Map([
          [ready.id, ready],
          [queued.id, queued],
          [blocked.id, blocked],
        ]),
      ),
      featureGateAccess: { requireFeatureGate },
    });

    await action.queueTrackForSeparation({ id: 'unknown' });
    await action.queueTrackForSeparation(ready);
    await action.queueTrackForSeparation(queued);
    await action.queueTrackForSeparation(blocked);

    expect(requireFeatureGate).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
    expect(useAppNotifications().items.value).toHaveLength(0);
  });

  it('uses the product accompaniment-processing term when enqueue fails', async () => {
    const track = { id: 'track-a', title: '第一首歌' };
    const action = useTrackSeparationAction({
      separationController: {
        queue: ref(null),
        error: shallowRef(''),
        enqueue: vi.fn().mockResolvedValue(null),
      },
      tracksById: ref(new Map([[track.id, track]])),
      featureGateAccess: {
        requireFeatureGate: vi.fn().mockResolvedValue(true),
      },
    });

    await action.queueTrackForSeparation(track);

    expect(action.error.value).toBe('歌曲目前無法加入伴奏處理佇列。');
    expect(useAppNotifications().items.value[0]).toMatchObject({
      title: '伴奏處理未加入',
      tone: 'danger',
      message: action.error.value,
    });
  });
});
