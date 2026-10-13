import { describe, expect, it } from 'vitest';
import {
  APP_DESTINATIONS,
  APP_DESTINATION_SHORTCUTS,
  appDestinationSettingsLabel,
  isAppDestination,
} from './appDestinationRegistry.js';

describe('app destination registry', () => {
  it('publishes the three user-language destinations in workflow order', () => {
    expect(APP_DESTINATIONS).toEqual([
      {
        id: 'library',
        label: '曲庫',
        settingsReturnLabel: '曲庫',
        shortcut: 'f1',
      },
      {
        id: 'performance',
        label: '演唱工具',
        settingsReturnLabel: '演唱工具',
        shortcut: 'f2',
      },
      {
        id: 'display',
        label: '畫面輸出',
        settingsReturnLabel: '畫面輸出',
        shortcut: 'f3',
      },
    ]);
  });

  it('leaves F4 unassigned and keeps Settings outside Folder destinations', () => {
    expect(APP_DESTINATION_SHORTCUTS).toEqual({
      f1: 'library',
      f2: 'performance',
      f3: 'display',
    });
    expect(isAppDestination('performance')).toBe(true);
    expect(isAppDestination('lyrics')).toBe(false);
    expect(isAppDestination('import')).toBe(false);
    expect(isAppDestination('settings')).toBe(false);
    expect(appDestinationSettingsLabel('display')).toBe('畫面輸出');
    expect(appDestinationSettingsLabel('settings')).toBeUndefined();
  });

  it('publishes immutable registry records', () => {
    expect(Object.isFrozen(APP_DESTINATIONS)).toBe(true);
    expect(
      APP_DESTINATIONS.every((destination) => Object.isFrozen(destination)),
    ).toBe(true);
    expect(Object.isFrozen(APP_DESTINATION_SHORTCUTS)).toBe(true);
  });
});
