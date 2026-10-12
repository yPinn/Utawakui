export const APP_DESTINATIONS = Object.freeze(
  [
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
  ].map(Object.freeze),
);

const destinationById = new Map(
  APP_DESTINATIONS.map((destination) => [destination.id, destination]),
);

export const APP_DESTINATION_SHORTCUTS = Object.freeze(
  Object.fromEntries(
    APP_DESTINATIONS.map((destination) => [
      destination.shortcut,
      destination.id,
    ]),
  ),
);

export function isAppDestination(destinationId) {
  return destinationById.has(destinationId);
}

export function appDestinationSettingsLabel(destinationId) {
  return destinationById.get(destinationId)?.settingsReturnLabel;
}
