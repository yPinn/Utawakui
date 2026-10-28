import { describe, expect, it } from 'vitest';
import { isShortcutInputBlocked } from './shortcutInputContext.js';

const element = (tagName = 'SPAN', attributes = {}, parentElement = null) => ({
  tagName,
  getAttribute: (key) => attributes[key] ?? null,
  parentElement,
});

describe('custom shortcut input context', () => {
  it('blocks native editable/interactive ancestors rather than only the inner target', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SUMMARY']) {
      expect(
        isShortcutInputBlocked({ target: element('SPAN', {}, element(tag)) }),
      ).toBe(true);
    }
    expect(
      isShortcutInputBlocked({
        target: element('SPAN', {}, { isContentEditable: true }),
      }),
    ).toBe(true);
    expect(
      isShortcutInputBlocked({ target: element('A', { href: '/settings' }) }),
    ).toBe(true);
    expect(isShortcutInputBlocked({ target: element('A') })).toBe(false);
  });
  it.each([
    'slider',
    'spinbutton',
    'textbox',
    'combobox',
    'listbox',
    'menu',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'tab',
    'tree',
    'treeitem',
    'grid',
    'gridcell',
    'button',
    'checkbox',
    'radio',
    'radiogroup',
    'switch',
    'option',
    'scrollbar',
    'tablist',
  ])('yields to the ARIA %s widget in the composed path', (role) => {
    const inner = element();
    expect(
      isShortcutInputBlocked({
        target: inner,
        composedPath: () => [inner, element('DIV', { role }), {}],
      }),
    ).toBe(true);
  });
  it('treats recording and blocking overlays as explicit owner context', () => {
    expect(isShortcutInputBlocked({}, { recording: true })).toBe(true);
    expect(isShortcutInputBlocked({}, { blocked: true })).toBe(true);
    expect(isShortcutInputBlocked({ target: element('DIV') })).toBe(false);
    expect(isShortcutInputBlocked({})).toBe(false);
  });
  it('can yield directional defaults to focusable regions without changing custom modifier policy', () => {
    const focusable = element('DIV', { tabindex: '0' });
    expect(isShortcutInputBlocked({ target: focusable })).toBe(false);
    expect(
      isShortcutInputBlocked(
        { target: element('SPAN', {}, focusable) },
        { includeFocusable: true },
      ),
    ).toBe(true);
    expect(
      isShortcutInputBlocked(
        { target: element(), composedPath: () => [element(), focusable] },
        { includeFocusable: true },
      ),
    ).toBe(true);
    expect(
      isShortcutInputBlocked(
        { target: element('DIV') },
        { includeFocusable: true },
      ),
    ).toBe(false);
  });
  it('blocks bounded-path overflow and malformed cyclic ancestry without hanging', () => {
    expect(
      isShortcutInputBlocked({ composedPath: () => Array(129).fill({}) }),
    ).toBe(true);
    const target = element();
    target.parentElement = target;
    expect(isShortcutInputBlocked({ target })).toBe(true);
    expect(
      isShortcutInputBlocked({
        target: element('DIV', { role: 'presentation slider' }),
      }),
    ).toBe(true);
  });
});
