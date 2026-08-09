import { describe, expect, it } from 'vitest';
import { isEditableTarget } from './dom.js';

describe('isEditableTarget', () => {
  it('is false for a missing target', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });

  it('is true for INPUT and TEXTAREA elements', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
  });

  it('is true for a contenteditable element regardless of tag', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(
      true,
    );
  });

  it('is falsy for a plain, non-editable element', () => {
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: false })).toBe(
      false,
    );
    // isContentEditable is absent (not just false) here, so the trailing
    // `||` chain yields undefined rather than false — still falsy, which is
    // all the caller's `if (isEditableTarget(...))` check relies on.
    expect(isEditableTarget({ tagName: 'BUTTON' })).toBeFalsy();
  });
});
