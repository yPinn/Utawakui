import { describe, expect, it } from 'vitest';
import {
  canTraverse,
  createNavigationStack,
  NAVIGATION_HISTORY_CAPACITY,
  recordLocation,
  traverse,
} from './navigationHistoryStack.js';

const entry = (key, extra = {}) => ({ key, ...extra });
const keys = (stack) => stack.entries.map((item) => item.key);
const always = () => true;

function stackOf(...entryKeys) {
  let stack = createNavigationStack(entry(entryKeys[0]));
  for (const key of entryKeys.slice(1)) {
    stack = recordLocation(stack, entry(key));
  }
  return stack;
}

describe('createNavigationStack', () => {
  it('starts with one current entry', () => {
    const stack = createNavigationStack(entry('a'));

    expect(keys(stack)).toEqual(['a']);
    expect(stack.index).toBe(0);
    expect(canTraverse(stack, -1, always)).toBe(false);
    expect(canTraverse(stack, 1, always)).toBe(false);
  });
});

describe('recordLocation', () => {
  it('pushes a different location and moves the cursor to it', () => {
    const stack = stackOf('a', 'b');

    expect(keys(stack)).toEqual(['a', 'b']);
    expect(stack.index).toBe(1);
  });

  it('does not push the same location twice', () => {
    const stack = recordLocation(stackOf('a', 'b'), entry('b'));

    expect(keys(stack)).toEqual(['a', 'b']);
    expect(stack.index).toBe(1);
  });

  it('refreshes the current entry details when the key is unchanged', () => {
    const stack = recordLocation(
      stackOf('a'),
      entry('a', { returnView: 'display' }),
    );

    expect(stack.entries[0].returnView).toBe('display');
    expect(keys(stack)).toEqual(['a']);
  });

  it('discards the forward stack when navigating from the middle', () => {
    const { stack: back } = traverse(stackOf('a', 'b', 'c'), -1, always);
    const stack = recordLocation(back, entry('d'));

    expect(keys(stack)).toEqual(['a', 'b', 'd']);
    expect(stack.index).toBe(2);
    expect(canTraverse(stack, 1, always)).toBe(false);
  });

  it('drops the oldest entries beyond capacity', () => {
    let stack = createNavigationStack(entry('0'), 3);
    for (const key of ['1', '2', '3'])
      stack = recordLocation(stack, entry(key));

    expect(keys(stack)).toEqual(['1', '2', '3']);
    expect(stack.index).toBe(2);
  });

  it('defaults to a capacity of 50', () => {
    expect(NAVIGATION_HISTORY_CAPACITY).toBe(50);

    let stack = createNavigationStack(entry('0'));
    for (let index = 1; index <= 60; index += 1) {
      stack = recordLocation(stack, entry(String(index)));
    }

    expect(stack.entries).toHaveLength(50);
    expect(stack.entries[0].key).toBe('11');
    expect(stack.entries.at(-1).key).toBe('60');
  });

  it('replaces the current entry instead of pushing when asked', () => {
    const stack = recordLocation(stackOf('a', 'b'), entry('c'), {
      replace: true,
    });

    expect(keys(stack)).toEqual(['a', 'c']);
    expect(stack.index).toBe(1);
  });

  it('collapses a replacement that matches its neighbour', () => {
    const stack = recordLocation(stackOf('a', 'b'), entry('a'), {
      replace: true,
    });

    expect(keys(stack)).toEqual(['a']);
    expect(stack.index).toBe(0);
  });

  it('keeps forward entries when replacing in the middle', () => {
    const { stack: back } = traverse(stackOf('a', 'b', 'c'), -1, always);
    const stack = recordLocation(back, entry('x'), { replace: true });

    expect(keys(stack)).toEqual(['a', 'x', 'c']);
    expect(stack.index).toBe(1);
  });

  it('does not mutate the previous stack', () => {
    const original = stackOf('a', 'b');
    recordLocation(original, entry('c'));

    expect(keys(original)).toEqual(['a', 'b']);
    expect(original.index).toBe(1);
  });
});

describe('traverse', () => {
  it('moves back and forward through the entries', () => {
    const start = stackOf('a', 'b', 'c');

    const back = traverse(start, -1, always);
    expect(back.entry.key).toBe('b');
    expect(back.stack.index).toBe(1);

    const forward = traverse(back.stack, 1, always);
    expect(forward.entry.key).toBe('c');
    expect(forward.stack.index).toBe(2);
  });

  it('returns null at either end', () => {
    expect(traverse(stackOf('a'), -1, always)).toBe(null);
    expect(traverse(stackOf('a', 'b'), 1, always)).toBe(null);
  });

  it('skips invalid entries and lands on the next valid one', () => {
    const stack = stackOf('a', 'dead-1', 'dead-2', 'b');
    const isValid = (item) => !item.key.startsWith('dead');

    const result = traverse(stack, -1, isValid);

    expect(result.entry.key).toBe('a');
    expect(result.stack.index).toBe(0);
    expect(canTraverse(stack, -1, isValid)).toBe(true);
  });

  it('cannot traverse when every entry in that direction is invalid', () => {
    const stack = stackOf('dead-1', 'dead-2', 'b');
    const isValid = (item) => !item.key.startsWith('dead');

    expect(canTraverse(stack, -1, isValid)).toBe(false);
    expect(traverse(stack, -1, isValid)).toBe(null);
  });

  it('keeps skipped entries in place', () => {
    const stack = stackOf('a', 'dead', 'b');
    const { stack: moved } = traverse(stack, -1, (item) => item.key !== 'dead');

    expect(keys(moved)).toEqual(['a', 'dead', 'b']);
  });
});
