import { describe, expect, it } from 'vitest';
import { pendingReorderOffset } from './separationToolbarQueue.js';

const items = ['a', 'b', 'c', 'd'].map((itemId) => ({ itemId }));

describe('separation toolbar pending reorder', () => {
  it('maps Queue-style before／after drops to one bounded offset', () => {
    expect(pendingReorderOffset(items, 'a', 'c', 'after')).toBe(2);
    expect(pendingReorderOffset(items, 'd', 'b', 'before')).toBe(-2);
    expect(pendingReorderOffset(items, 'b', 'c', 'before')).toBe(0);
  });

  it('rejects unsupported targets and positions', () => {
    expect(pendingReorderOffset(items, 'missing', 'b', 'before')).toBe(0);
    expect(pendingReorderOffset(items, 'a', 'missing', 'after')).toBe(0);
    expect(pendingReorderOffset(items, 'a', 'b', 'middle')).toBe(0);
  });
});
