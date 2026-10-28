import { expect, it } from 'vitest';
import {
  formatShortcutChord,
  shortcutConflictMessage,
} from './keyboardShortcutPresentation.js';
it('formats product chords without reflecting arbitrary keys or private conflict text', () => {
  expect(
    formatShortcutChord({ key: 'up', ctrl: true, alt: false, shift: false }),
  ).toBe('Ctrl + ↑');
  expect(
    formatShortcutChord({ key: 'j', ctrl: false, alt: true, shift: true }),
  ).toBe('Alt + Shift + J');
  expect(formatShortcutChord(null)).toBe('未設定');
  expect(formatShortcutChord({ key: 'private/path' })).toBe('未設定');
  expect(
    shortcutConflictMessage(
      { code: 'shortcut-conflict', commands: ['player.next', 'player.mute'] },
      'player.next',
    ),
  ).toContain('歌曲靜音');
  expect(
    shortcutConflictMessage(
      { code: 'shortcut-conflict', commands: ['private/path'] },
      'player.next',
    ),
  ).not.toContain('private');
});
