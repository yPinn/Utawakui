import { nextTick, reactive, watch } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import limits from '../../shared/playbackPersistenceValues.json';
import {
  buildPlaybackResumeIntent,
  resumeWatchSources,
} from './playbackResumeIntent.js';

const LIMIT = limits.queueLimit;

function tracks(count, prefix = 't') {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index}`,
  }));
}

function build(queueOverrides = {}, playerOverrides = {}) {
  const source = queueOverrides.tracks ?? tracks(3);
  return buildPlaybackResumeIntent({
    playerState: {
      track: { id: source[0].id },
      currentTime: 12.5,
      volume: 0.5,
      isMuted: false,
      playbackMode: 'sequence',
      ...playerOverrides,
    },
    queueState: {
      tracks: source,
      queuedTracks: [],
      historyEntries: [],
      currentIsSource: true,
      lastSourceTrackId: source[0].id,
      sourceName: '清單',
      sourceId: 'p1',
      isShuffle: false,
      orderIds: source.map((track) => track.id),
      ...queueOverrides,
    },
  });
}

describe('buildPlaybackResumeIntent', () => {
  it('returns null without a current track', () => {
    expect(
      buildPlaybackResumeIntent({
        playerState: { track: null },
        queueState: {},
      }),
    ).toBeNull();
  });

  it('keeps small queues intact', () => {
    const intent = build();
    expect(intent.queue.sourceTrackIds).toEqual(['t0', 't1', 't2']);
    expect(intent.queue.orderIds).toEqual(['t0', 't1', 't2']);
  });

  it('bounds every list to the persistence limit', () => {
    const source = tracks(LIMIT + 200);
    const intent = build({
      tracks: source,
      orderIds: source.map((track) => track.id),
      queuedTracks: tracks(LIMIT + 5, 'q'),
      historyEntries: tracks(LIMIT + 5, 'h').map((track) => ({
        track,
        source: true,
      })),
    });

    expect(intent.queue.sourceTrackIds).toHaveLength(LIMIT);
    expect(intent.queue.orderIds.length).toBeLessThanOrEqual(LIMIT);
    expect(intent.queue.queuedTrackIds).toHaveLength(LIMIT);
    expect(intent.queue.historyEntries).toHaveLength(LIMIT);
    // History keeps the most recent entries.
    expect(intent.queue.historyEntries.at(-1).trackId).toBe(`h${LIMIT + 4}`);
  });

  it('keeps the current source track inside the bounded source window', () => {
    const source = tracks(LIMIT + 300);
    const current = source[LIMIT + 250];
    const intent = build(
      {
        tracks: source,
        orderIds: source.map((track) => track.id),
        lastSourceTrackId: current.id,
      },
      { track: { id: current.id } },
    );

    expect(intent.queue.sourceTrackIds).toContain(current.id);
    expect(intent.queue.sourceTrackIds).toHaveLength(LIMIT);
    const window = new Set(intent.queue.sourceTrackIds);
    expect(intent.queue.orderIds.every((id) => window.has(id))).toBe(true);
    expect(intent.queue.lastSourceTrackId).toBe(current.id);
  });

  it('drops a last source id that fell outside the window', () => {
    const source = tracks(LIMIT + 300);
    const intent = build(
      {
        tracks: source,
        orderIds: source.map((track) => track.id),
        lastSourceTrackId: 't0',
      },
      { track: { id: `t${LIMIT + 250}` } },
    );

    expect(intent.queue.sourceTrackIds).not.toContain('t0');
    expect(intent.queue.lastSourceTrackId).toBeNull();
  });
});

describe('resumeWatchSources', () => {
  function setup() {
    let elementReads = 0;
    const source = Array.from({ length: 800 }, (_, index) => ({
      get id() {
        elementReads += 1;
        return `t${index}`;
      },
    }));
    const playerState = reactive({
      track: { id: 't0' },
      currentTime: 0,
      volume: 0.5,
      isMuted: false,
      playbackMode: 'sequence',
    });
    const queueState = reactive({
      tracks: source,
      queuedTracks: [],
      historyEntries: [],
      currentIsSource: true,
      lastSourceTrackId: 't0',
      sourceName: '',
      sourceId: null,
      isShuffle: false,
      orderIds: [],
    });
    return { playerState, queueState, reads: () => elementReads };
  }

  it('fires on position ticks and queue reassignment without walking the queue', async () => {
    const { playerState, queueState, reads } = setup();
    const onChange = vi.fn();
    watch(() => resumeWatchSources({ playerState, queueState }), onChange);

    playerState.currentTime = 1;
    await nextTick();
    queueState.queuedTracks = [{ id: 'q1' }];
    await nextTick();
    queueState.isShuffle = true;
    await nextTick();

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(reads()).toBe(0);
  });
});
