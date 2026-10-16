import { describe, expect, it } from 'vitest';
import {
  APP_DESTINATIONS,
  APP_DESTINATION_SHORTCUTS,
  isAppDestination,
} from './appDestinationRegistry.js';

describe('app destination registry', () => {
  it('publishes the four user-language destinations in workflow order', () => {
    expect(APP_DESTINATIONS).toEqual([
      {
        id: 'library',
        label: '曲庫',
        material: 'primary',
        shortcut: 'f1',
      },
      {
        id: 'performance',
        label: '演唱工具',
        material: 'secondary',
        shortcut: 'f2',
      },
      {
        id: 'display',
        label: '畫面輸出',
        material: 'tertiary',
        shortcut: 'f3',
      },
      {
        id: 'settings',
        label: '設定',
        material: 'neutral',
        shortcut: 'f9',
      },
    ]);
  });

  it('leaves F4 unassigned and derives Settings from the Folder registry', () => {
    expect(APP_DESTINATION_SHORTCUTS).toEqual({
      f1: 'library',
      f2: 'performance',
      f3: 'display',
      f9: 'settings',
    });
    expect(isAppDestination('performance')).toBe(true);
    expect(isAppDestination('lyrics')).toBe(false);
    expect(isAppDestination('import')).toBe(false);
    expect(isAppDestination('settings')).toBe(true);
  });

  it('publishes immutable registry records', () => {
    expect(Object.isFrozen(APP_DESTINATIONS)).toBe(true);
    expect(
      APP_DESTINATIONS.every((destination) => Object.isFrozen(destination)),
    ).toBe(true);
    expect(Object.isFrozen(APP_DESTINATION_SHORTCUTS)).toBe(true);
  });
});
