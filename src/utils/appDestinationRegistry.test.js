import { describe, expect, it } from 'vitest';
import {
  APP_DESTINATIONS,
  APP_DESTINATION_SHORTCUTS,
  appDestinationSettingsLabel,
  isAppDestination,
} from './appDestinationRegistry.js';

describe('app destination registry', () => {
  it('keeps the current four-destination order and labels during Phase 1', () => {
    expect(APP_DESTINATIONS).toEqual([
      {
        id: 'setlist',
        label: 'Setlist',
        settingsReturnLabel: '歌單',
        shortcut: 'f1',
      },
      {
        id: 'lyrics',
        label: 'Lyrics',
        settingsReturnLabel: '歌詞',
        shortcut: 'f2',
      },
      {
        id: 'output',
        label: 'Output',
        settingsReturnLabel: '輸出',
        shortcut: 'f3',
      },
      {
        id: 'import',
        label: 'Import',
        settingsReturnLabel: '匯入',
        shortcut: 'f4',
      },
    ]);
  });

  it('derives shortcuts and membership without registering Settings as a Folder destination', () => {
    expect(APP_DESTINATION_SHORTCUTS).toEqual({
      f1: 'setlist',
      f2: 'lyrics',
      f3: 'output',
      f4: 'import',
    });
    expect(isAppDestination('lyrics')).toBe(true);
    expect(isAppDestination('settings')).toBe(false);
    expect(appDestinationSettingsLabel('output')).toBe('輸出');
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
