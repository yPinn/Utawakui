export const APP_DESTINATIONS = Object.freeze(
  [
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
