import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRovingRadioGroup } from './useRovingRadioGroup.js';

function makeRadio(id) {
  return {
    dataset: { radioId: id },
    focus: vi.fn(),
  };
}

function makeEvent(key) {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

function makeGroup(items) {
  return {
    value: {
      querySelectorAll: vi.fn(() => items),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRovingRadioGroup', () => {
  it('makes only the selected radio tabbable', () => {
    const { tabindexFor } = useRovingRadioGroup(makeGroup([]), vi.fn());

    expect(tabindexFor('lyrics', 'lyrics')).toBe(0);
    expect(tabindexFor('setlist', 'lyrics')).toBe(-1);
  });

  it('ignores non-arrow keys and empty groups', () => {
    const onSelect = vi.fn();
    const { handleKeydown } = useRovingRadioGroup(makeGroup([]), onSelect);
    const enter = makeEvent('Enter');
    const arrowRight = makeEvent('ArrowRight');

    handleKeydown(enter);
    handleKeydown(arrowRight);

    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(arrowRight.preventDefault).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('moves focus and selection to the next radio', () => {
    const first = makeRadio('first');
    const second = makeRadio('second');
    const onSelect = vi.fn();
    vi.stubGlobal('document', { activeElement: first });

    const { handleKeydown } = useRovingRadioGroup(
      makeGroup([first, second]),
      onSelect,
    );
    const event = makeEvent('ArrowRight');

    handleKeydown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(second.focus).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('second');
  });

  it('wraps when moving before the first radio', () => {
    const first = makeRadio('first');
    const second = makeRadio('second');
    const onSelect = vi.fn();
    vi.stubGlobal('document', { activeElement: first });

    const { handleKeydown } = useRovingRadioGroup(
      makeGroup([first, second]),
      onSelect,
    );

    handleKeydown(makeEvent('ArrowLeft'));

    expect(second.focus).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('second');
  });

  it('starts from the first item when activeElement is outside the group', () => {
    const first = makeRadio('first');
    const second = makeRadio('second');
    const outside = makeRadio('outside');
    const onSelect = vi.fn();
    vi.stubGlobal('document', { activeElement: outside });

    const { handleKeydown } = useRovingRadioGroup(
      makeGroup([first, second]),
      onSelect,
    );

    handleKeydown(makeEvent('ArrowDown'));

    expect(second.focus).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith('second');
  });
});
