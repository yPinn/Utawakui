import { nextTick, reactive, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  SEPARATION_PRESET_OPTIONS,
} from '../constants/separationPresets.js';
import { useSeparationPreparation } from './useSeparationPreparation.js';

function setup({ enabled = true, enqueueAvailable = true } = {}) {
  const enqueue = vi.fn().mockResolvedValue({});
  const requireFeatureGate = vi.fn().mockResolvedValue(enabled);
  const queue = shallowRef({ items: [] });
  const playlistState = reactive({
    playlists: [
      {
        id: 'album-1',
        name: '花皮',
        kind: 'album',
        trackIds: ['album-a'],
      },
      {
        id: 'playlist-2',
        name: '暖場歌單',
        kind: 'playlist',
        trackIds: [],
      },
      {
        id: 'album-3',
        name: 'After Dark',
        kind: 'album',
        trackIds: ['album-c'],
      },
      {
        id: 'playlist-1',
        name: '演出歌單',
        kind: 'playlist',
        trackIds: ['playlist-b', 'playlist-a'],
      },
      {
        id: 'album-2',
        name: '未來',
        kind: 'album',
        trackIds: ['album-b'],
      },
    ],
  });
  const collectionTracks = new Map([
    [
      'playlist-1',
      [
        { id: 'playlist-b', duration: 90 },
        { id: 'playlist-a', duration: 60 },
      ],
    ],
    ['album-1', [{ id: 'album-a', duration: 180 }]],
    ['album-2', [{ id: 'album-b', duration: 180 }]],
    ['album-3', [{ id: 'album-c', duration: 180 }]],
  ]);
  const resolveCollectionTracks = vi.fn(
    (collection) => collectionTracks.get(collection?.id) ?? [],
  );
  const preparation = useSeparationPreparation({
    enqueue: enqueueAvailable ? enqueue : undefined,
    playbackQueue: {
      currentTrack: shallowRef({ id: 'current', duration: 60 }),
      queuedTracks: shallowRef([
        {
          id: 'manual',
          duration: 120,
          separation: { results: { general: { completedAt: 1 } } },
        },
        { id: 'current', duration: 60 },
      ]),
      sourceUpcomingTracks: shallowRef([
        {
          id: 'source',
          duration: 180,
          separation: { results: { quick: { completedAt: 1 } } },
        },
      ]),
    },
    queue,
    playlistState,
    tracksById: shallowRef(
      new Map([
        [
          'album-a',
          { id: 'album-a', artist: 'Sabrina 胡恂舞', releaseYear: 2025 },
        ],
        [
          'album-b',
          { id: 'album-b', artist: 'Sabrina 胡恂舞', releaseYear: 2026 },
        ],
        ['album-c', { id: 'album-c', artist: 'Aimer', releaseYear: 2024 }],
      ]),
    ),
    resolveCollectionTracks,
    featureGateAccess: { requireFeatureGate },
  });
  return {
    enqueue,
    playlistState,
    preparation,
    queue,
    requireFeatureGate,
    resolveCollectionTracks,
  };
}

afterEach(() => {
  const { selectedMode } = setup().preparation;
  selectedMode.value = DEFAULT_SEPARATION_PRESET_ID;
});

describe('useSeparationPreparation', () => {
  it('partitions one ordered source projection by the selected recipe', () => {
    const { preparation } = setup();
    expect(preparation.sourceTracks.value.map(({ id }) => id)).toEqual([
      'current',
      'manual',
      'source',
    ]);
    expect(preparation.unpreparedTracks.value.map(({ id }) => id)).toEqual([
      'current',
      'source',
    ]);
    expect(preparation.preparedTracks.value.map(({ id }) => id)).toEqual([
      'manual',
    ]);
    expect(preparation.planHint.value).toBe('2 首 · 最多新增約 81 MB');
    expect(preparation.selectedMode.value).toBe(DEFAULT_SEPARATION_PRESET_ID);
    expect(preparation.modeOptions).toEqual(
      SEPARATION_PRESET_OPTIONS.map(({ id, label }) => ({
        value: id,
        label,
      })),
    );
    expect(preparation.selectedSourceId.value).toBe('playback-order');
    expect(preparation.sourceOptions.value).toEqual([
      { value: 'playback-order', label: '目前播放順序' },
      {
        label: '播放清單',
        options: [
          { value: 'collection:playlist-2', label: '暖場歌單' },
          { value: 'collection:playlist-1', label: '演出歌單' },
        ],
      },
      {
        label: '專輯',
        options: [
          {
            value: 'collection:album-3',
            label: 'After Dark · Aimer',
            primaryLabel: 'After Dark',
            secondaryLabel: 'Aimer',
            searchText: 'After Dark Aimer',
          },
          {
            value: 'collection:album-2',
            label: '未來 · Sabrina 胡恂舞',
            primaryLabel: '未來',
            secondaryLabel: 'Sabrina 胡恂舞',
            searchText: '未來 Sabrina 胡恂舞',
          },
          {
            value: 'collection:album-1',
            label: '花皮 · Sabrina 胡恂舞',
            primaryLabel: '花皮',
            secondaryLabel: 'Sabrina 胡恂舞',
            searchText: '花皮 Sabrina 胡恂舞',
          },
        ],
      },
    ]);
  });

  it('starts only unprepared tracks after checking the feature gate', async () => {
    const { enqueue, preparation, requireFeatureGate } = setup();

    await preparation.startUnpreparedTracks();

    expect(requireFeatureGate).toHaveBeenCalledWith(
      'audio-processing-flow',
      expect.objectContaining({ operation: 'enqueue' }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      ['current', 'source'],
      DEFAULT_SEPARATION_PRESET_ID,
      false,
    );
    expect(preparation.isStarting.value).toBe(false);
  });

  it('restarts only tracks with a current result for the selected recipe', async () => {
    const { enqueue, preparation } = setup();

    await preparation.restartPreparedTracks();

    expect(enqueue).toHaveBeenCalledWith(
      ['manual'],
      DEFAULT_SEPARATION_PRESET_ID,
      true,
    );
    expect(preparation.isRestarting.value).toBe(false);
  });

  it('adds only the requested unprepared source track through the existing gate and recipe', async () => {
    const { preparation, enqueue, requireFeatureGate } = setup();
    preparation.selectedMode.value = 'quick';
    await preparation.startUnpreparedTrack('manual');
    expect(requireFeatureGate).toHaveBeenCalledWith(
      'audio-processing-flow',
      expect.objectContaining({ operation: 'enqueue' }),
    );
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(['manual'], 'quick', false);
  });

  it('rejects unknown, already prepared, and already queued single-track intents', async () => {
    const { preparation, enqueue, requireFeatureGate, queue } = setup();
    await preparation.startUnpreparedTrack('unknown');
    await preparation.startUnpreparedTrack('manual');
    queue.value = {
      items: [
        {
          trackId: 'current',
          recipeId: DEFAULT_SEPARATION_PRESET_ID,
          status: 'pending',
        },
      ],
    };
    await preparation.startUnpreparedTrack('current');
    expect(requireFeatureGate).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('keeps a single-track click snapshot and blocks repeat clicks until enqueue settles', async () => {
    const { preparation, enqueue, requireFeatureGate } = setup();
    let resolveGate;
    let resolveEnqueue;
    requireFeatureGate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGate = resolve;
        }),
    );
    enqueue.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnqueue = resolve;
        }),
    );
    const pending = preparation.startUnpreparedTrack('current');
    expect(preparation.isBusy.value).toBe(true);
    await preparation.startUnpreparedTrack('source');
    preparation.selectedMode.value = 'quick';
    preparation.selectedSourceId.value = 'collection:playlist-1';
    resolveGate(true);
    await Promise.resolve();
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(
      ['current'],
      DEFAULT_SEPARATION_PRESET_ID,
      false,
    );
    expect(preparation.isBusy.value).toBe(true);
    await preparation.startUnpreparedTrack('playlist-a');
    resolveEnqueue({ ok: true });
    await pending;
    expect(preparation.isBusy.value).toBe(false);
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it('resets busy after denied setup or a failed single-track enqueue', async () => {
    const { preparation, enqueue, requireFeatureGate } = setup({
      enabled: false,
    });
    await preparation.startUnpreparedTrack('current');
    expect(enqueue).not.toHaveBeenCalled();
    expect(preparation.isBusy.value).toBe(false);
    requireFeatureGate.mockResolvedValue(true);
    enqueue.mockRejectedValue(new Error('enqueue failed'));
    await expect(preparation.startUnpreparedTrack('current')).rejects.toThrow(
      'enqueue failed',
    );
    expect(preparation.isBusy.value).toBe(false);
  });

  it('excludes same-recipe queue entries without hiding another recipe', () => {
    const { preparation, queue } = setup();
    queue.value = {
      items: [
        { itemId: 'queue-1', trackId: 'current', recipeId: 'general' },
        { itemId: 'queue-2', trackId: 'manual', recipeId: 'quick' },
      ],
    };

    expect(preparation.unpreparedTracks.value.map(({ id }) => id)).toEqual([
      'source',
    ]);
    expect(preparation.preparedTracks.value.map(({ id }) => id)).toEqual([
      'manual',
    ]);

    preparation.selectedMode.value = 'quick';
    expect(preparation.unpreparedTracks.value.map(({ id }) => id)).toEqual([
      'current',
    ]);
    expect(preparation.preparedTracks.value.map(({ id }) => id)).toEqual([
      'source',
    ]);
  });

  it('does not enqueue when setup is unavailable', async () => {
    const { enqueue, preparation } = setup({ enabled: false });
    await preparation.startUnpreparedTracks();
    expect(enqueue).not.toHaveBeenCalled();
    expect(preparation.isStarting.value).toBe(false);
  });

  it('snapshots a selected playlist or album in its saved order', async () => {
    const { enqueue, preparation, resolveCollectionTracks } = setup();

    preparation.selectedSourceId.value = 'collection:playlist-1';
    expect(preparation.sourceTracks.value.map(({ id }) => id)).toEqual([
      'playlist-b',
      'playlist-a',
    ]);
    await preparation.startUnpreparedTracks();

    expect(resolveCollectionTracks).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'playlist-1' }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      ['playlist-b', 'playlist-a'],
      DEFAULT_SEPARATION_PRESET_ID,
      false,
    );
  });

  it('keeps the click-time snapshot while the feature gate is resolving', async () => {
    const { enqueue, preparation, requireFeatureGate } = setup();
    let resolveGate;
    requireFeatureGate.mockImplementation(
      () => new Promise((resolve) => (resolveGate = resolve)),
    );
    preparation.selectedSourceId.value = 'collection:playlist-1';

    const adding = preparation.startUnpreparedTracks();
    preparation.selectedSourceId.value = 'collection:album-1';
    resolveGate(true);
    await adding;

    expect(enqueue).toHaveBeenCalledWith(
      ['playlist-b', 'playlist-a'],
      DEFAULT_SEPARATION_PRESET_ID,
      false,
    );
  });

  it('falls back visibly when the selected collection disappears', async () => {
    const { playlistState, preparation } = setup();
    preparation.selectedSourceId.value = 'collection:playlist-1';

    playlistState.playlists = playlistState.playlists.filter(
      ({ id }) => id !== 'playlist-1',
    );
    await nextTick();

    expect(preparation.selectedSourceId.value).toBe('playback-order');
    expect(preparation.sourceTracks.value.map(({ id }) => id)).toEqual([
      'current',
      'manual',
      'source',
    ]);
  });

  it('does not request a gate for an empty source or a missing enqueue capability', async () => {
    const empty = setup();
    empty.preparation.selectedSourceId.value = 'collection:playlist-2';
    await empty.preparation.startUnpreparedTracks();
    expect(empty.requireFeatureGate).not.toHaveBeenCalled();
    const unavailable = setup({ enqueueAvailable: false });
    await unavailable.preparation.startUnpreparedTrack('current');
    expect(unavailable.requireFeatureGate).not.toHaveBeenCalled();
    expect(unavailable.enqueue).not.toHaveBeenCalled();
  });

  it('deduplicates collection candidates and ignores entries without a track identity', () => {
    const { preparation, resolveCollectionTracks, queue } = setup();
    resolveCollectionTracks.mockReturnValue([
      null,
      {},
      { id: 'one' },
      { id: 'one' },
      { id: 'two' },
    ]);
    preparation.selectedSourceId.value = 'collection:playlist-1';
    queue.value = null;
    expect(preparation.unpreparedTracks.value.map((track) => track.id)).toEqual(
      ['one', 'two'],
    );
  });

  it('keeps albums without known artist metadata selectable', () => {
    const { preparation, playlistState } = setup();
    playlistState.playlists.push({
      id: 'album-new',
      kind: 'album',
      name: 'Unknown artist album',
      trackIds: [],
    });
    const options = preparation.sourceOptions.value.flatMap(
      (option) => option.options ?? [option],
    );
    expect(
      options.find((option) => option.value === 'collection:album-new'),
    ).toEqual({
      value: 'collection:album-new',
      label: 'Unknown artist album',
      primaryLabel: 'Unknown artist album',
    });
  });
});
