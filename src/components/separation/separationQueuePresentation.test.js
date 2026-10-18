import { describe, expect, it } from 'vitest';
import {
  buildSeparationPlan,
  estimateSeparationOutput,
  separationPlanSummary,
  separationQueueIndicator,
  separationItemLabel,
  separationQueueSummary,
  separationSourceStatus,
} from './separationQueuePresentation.js';

describe('separation queue presentation', () => {
  it('prioritizes a retried open entry over newer terminal history for the same track', () => {
    const tracks = [{ id: 'track' }];
    for (const status of ['pending', 'checking', 'running']) {
      const items = [
        { trackId: 'track', recipeId: 'general', status },
        { trackId: 'track', recipeId: 'general', status: 'completed' },
      ];
      const expected =
        status === 'pending'
          ? [{ id: 'pending', label: '待處理', count: 1 }]
          : [];
      expect(separationSourceStatus(tracks, items, 'general')).toEqual(
        expected,
      );
      expect(
        separationSourceStatus(tracks, [...items].reverse(), 'general'),
      ).toEqual(expected);
    }
  });
  it('summarizes only the selected source and recipe without counting the single active track', () => {
    const tracks = [
      { id: 'new' },
      { id: 'pending' },
      { id: 'active' },
      { id: 'checking' },
      { id: 'saved', separation: { results: { general: {} } } },
      { id: 'done' },
      { id: 'skipped' },
      { id: 'failed' },
      { id: 'cancelled' },
      { id: 'other-mode', separation: { results: { quick: {} } } },
    ];
    const items = [
      ['pending', 'pending'],
      ['active', 'running'],
      ['checking', 'checking'],
      ['done', 'completed'],
      ['skipped', 'skipped'],
      ['failed', 'failed'],
      ['cancelled', 'cancelled'],
      ['outside-source', 'completed'],
    ].map(([trackId, status]) => ({ trackId, status, recipeId: 'general' }));
    items.push({
      trackId: 'other-mode',
      status: 'completed',
      recipeId: 'quick',
    });
    expect(separationSourceStatus(tracks, items, 'general')).toEqual([
      { id: 'pending', label: '待處理', count: 3 },
      { id: 'completed', label: '已完成', count: 3 },
      { id: 'attention', label: '未完成', count: 2 },
    ]);
    expect(separationSourceStatus([], items, 'general')).toEqual([]);
  });

  it('keeps completed state when queue history is cleared and hides zero counts', () => {
    expect(
      separationSourceStatus(
        [{ id: 'saved', separation: { results: { general: {} } } }],
        [],
        'general',
      ),
    ).toEqual([{ id: 'completed', label: '已完成', count: 1 }]);
    expect(
      separationSourceStatus(
        [{ id: 'active' }],
        [{ trackId: 'active', recipeId: 'general', status: 'running' }],
        'general',
      ),
    ).toEqual([]);
  });
  it('builds one ordered plan from current, manually queued, and source tracks', () => {
    expect(
      buildSeparationPlan({
        currentTrack: { id: 'current', duration: 60 },
        queuedTracks: [
          { id: 'manual', duration: 120 },
          { id: 'current', duration: 60 },
        ],
        sourceUpcomingTracks: [
          { id: 'source', duration: 180 },
          { id: 'manual', duration: 120 },
        ],
      }).map(({ id }) => id),
    ).toEqual(['current', 'manual', 'source']);
  });

  it('shows a conservative storage estimate only from known durations', () => {
    expect(
      estimateSeparationOutput([
        { id: 'one', duration: 60 },
        { id: 'two', duration: 240 },
        { id: 'unknown' },
      ]),
    ).toEqual({ knownTracks: 2, totalTracks: 3, label: '約 101 MB' });
    expect(estimateSeparationOutput([{ id: 'long', duration: 3_600 }])).toEqual(
      { knownTracks: 1, totalTracks: 1, label: '約 1.2 GB' },
    );
    expect(estimateSeparationOutput([{ id: 'unknown' }])).toEqual({
      knownTracks: 0,
      totalTracks: 1,
      label: '',
    });
  });

  it('labels capacity as a per-plan upper bound only when every duration is known', () => {
    expect(
      separationPlanSummary([
        { id: 'one', duration: 60 },
        { id: 'two', duration: 120 },
      ]),
    ).toBe('2 首 · 最多新增約 61 MB');
    expect(
      separationPlanSummary([{ id: 'one', duration: 60 }, { id: 'unknown' }]),
    ).toBe('2 首');
    expect(separationPlanSummary([])).toBe('0 首');
  });

  it('uses everyday labels for progress and terminal states', () => {
    expect(separationItemLabel({ status: 'pending' })).toBe('等候中');
    expect(separationItemLabel({ status: 'checking' })).toBe('準備中');
    expect(separationItemLabel({ status: 'running', percent: 42 })).toBe('42%');
    expect(separationItemLabel({ status: 'running' })).toBe('處理中');
    expect(separationItemLabel({ status: 'completed' })).toBe('已完成');
    expect(separationItemLabel({ status: 'skipped' })).toBe('已有伴奏');
    expect(separationItemLabel({ status: 'failed' })).toBe('未完成');
    expect(separationItemLabel({ status: 'cancelled' })).toBe('已停止');
    expect(separationItemLabel({ status: 'unknown' })).toBe('');
  });

  it('summarizes work without exposing engine terminology', () => {
    expect(separationQueueSummary(null)).toBe('依播放順序準備');
    expect(
      separationQueueSummary({
        status: 'running',
        done: 2,
        total: 5,
        pending: 2,
        failed: 0,
      }),
    ).toBe('已處理 2 / 5 首');
    expect(
      separationQueueSummary({
        status: 'pausing',
        done: 2,
        total: 5,
        pending: 2,
        failed: 0,
      }),
    ).toBe('這首完成後暫停');
    expect(
      separationQueueSummary({
        status: 'paused',
        done: 2,
        total: 5,
        pending: 3,
        failed: 0,
      }),
    ).toBe('已暫停 · 3 首待處理');
    expect(
      separationQueueSummary({
        status: 'idle',
        done: 5,
        total: 5,
        pending: 0,
        failed: 1,
      }),
    ).toBe('4 首完成 · 1 首未完成');
    expect(
      separationQueueSummary({
        status: 'idle',
        done: 5,
        total: 5,
        pending: 0,
      }),
    ).toBe('5 首完成');
  });

  it('projects a compact status for the persistent accompaniment entry point', () => {
    expect(separationQueueIndicator(null)).toEqual({
      state: 'idle',
      label: '',
    });
    expect(
      separationQueueIndicator({
        status: 'running',
        done: 1,
        total: 3,
        pending: 1,
        failed: 0,
        cancelled: 0,
      }),
    ).toEqual({ state: 'running', label: '處理中 1/3' });
    expect(
      separationQueueIndicator({
        status: 'pausing',
        done: 1,
        total: 3,
        pending: 1,
        failed: 0,
        cancelled: 0,
      }),
    ).toEqual({ state: 'pausing', label: '即將暫停' });
    expect(
      separationQueueIndicator({
        status: 'paused',
        done: 1,
        total: 3,
        pending: 2,
        failed: 0,
        cancelled: 0,
      }),
    ).toEqual({ state: 'paused', label: '已暫停' });
    expect(
      separationQueueIndicator({
        status: 'paused',
        done: 3,
        total: 3,
        pending: 0,
        failed: 0,
        cancelled: 0,
      }),
    ).toEqual({ state: 'paused', label: '已暫停' });
    expect(
      separationQueueIndicator({
        status: 'idle',
        done: 3,
        total: 3,
        pending: 0,
        failed: 1,
        cancelled: 1,
      }),
    ).toEqual({ state: 'attention', label: '2 首未完成' });
    expect(
      separationQueueIndicator({
        status: 'idle',
        done: 3,
        total: 3,
        pending: 0,
        failed: 0,
        cancelled: 0,
      }),
    ).toEqual({ state: 'idle', label: '' });
  });
});
