import { describe, expect, it } from 'vitest';
import {
  buildSeparationPlan,
  estimateSeparationOutput,
  separationItemLabel,
  separationQueueSummary,
} from './separationQueuePresentation.js';

describe('separation queue presentation', () => {
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
  });

  it('uses everyday labels for progress and terminal states', () => {
    expect(separationItemLabel({ status: 'pending' })).toBe('等候中');
    expect(separationItemLabel({ status: 'checking' })).toBe('準備中');
    expect(separationItemLabel({ status: 'running', percent: 42 })).toBe('42%');
    expect(separationItemLabel({ status: 'skipped' })).toBe('已有伴奏');
    expect(separationItemLabel({ status: 'failed' })).toBe('未完成');
    expect(separationItemLabel({ status: 'cancelled' })).toBe('已停止');
  });

  it('summarizes work without exposing engine terminology', () => {
    expect(separationQueueSummary(null)).toBe('依播放順序逐首準備');
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
        status: 'paused',
        done: 2,
        total: 5,
        pending: 3,
        failed: 0,
      }),
    ).toBe('已暫停 · 3 首等候中');
    expect(
      separationQueueSummary({
        status: 'idle',
        done: 5,
        total: 5,
        pending: 0,
        failed: 1,
      }),
    ).toBe('4 首已完成 · 1 首未完成');
  });
});
