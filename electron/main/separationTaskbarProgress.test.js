import { describe, expect, it } from 'vitest';
import separationTaskbarProgressModule from './separationTaskbarProgress.js';

const { projectSeparationTaskbarProgress } = separationTaskbarProgressModule;

function queue(overrides = {}) {
  return {
    queue: {
      status: 'running',
      total: 4,
      done: 1,
      failed: 0,
      cancelled: 0,
      activeItemId: 'active',
      items: [
        { itemId: 'done', status: 'completed' },
        { itemId: 'active', status: 'running', percent: 50 },
        { itemId: 'pending-1', status: 'pending' },
        { itemId: 'pending-2', status: 'pending' },
      ],
      ...overrides,
    },
  };
}

describe('separation taskbar progress projection', () => {
  it('clears idle successful or missing work', () => {
    expect(projectSeparationTaskbarProgress({ queue: null })).toEqual({
      value: -1,
      mode: 'none',
      active: false,
      requiresAttention: false,
    });
    expect(
      projectSeparationTaskbarProgress(
        queue({ status: 'idle', done: 4, activeItemId: null }),
      ),
    ).toMatchObject({ value: -1, mode: 'none', active: false });
  });

  it('uses aggregate determinate progress for a running item', () => {
    expect(projectSeparationTaskbarProgress(queue())).toEqual({
      value: 0.375,
      mode: 'normal',
      active: true,
      requiresAttention: false,
    });
  });

  it('uses indeterminate progress while the active item has no percentage', () => {
    expect(
      projectSeparationTaskbarProgress(
        queue({
          items: [
            { itemId: 'done', status: 'completed' },
            { itemId: 'active', status: 'checking' },
            { itemId: 'pending-1', status: 'pending' },
            { itemId: 'pending-2', status: 'pending' },
          ],
        }),
      ),
    ).toMatchObject({ value: 2, mode: 'indeterminate', active: true });
  });

  it('distinguishes paused work from terminal attention', () => {
    expect(
      projectSeparationTaskbarProgress(
        queue({
          status: 'paused',
          done: 2,
          activeItemId: null,
          items: [
            { itemId: 'done-1', status: 'completed' },
            { itemId: 'done-2', status: 'completed' },
            { itemId: 'pending-1', status: 'pending' },
            { itemId: 'pending-2', status: 'pending' },
          ],
        }),
      ),
    ).toEqual({
      value: 0.5,
      mode: 'paused',
      active: true,
      requiresAttention: false,
    });
    expect(
      projectSeparationTaskbarProgress(
        queue({
          status: 'idle',
          done: 4,
          failed: 1,
          activeItemId: null,
        }),
      ),
    ).toEqual({
      value: 1,
      mode: 'error',
      active: false,
      requiresAttention: true,
    });
  });
});
