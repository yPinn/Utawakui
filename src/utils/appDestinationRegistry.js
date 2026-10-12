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
      label: '演唱',
      settingsReturnLabel: '演唱',
      shortcut: 'f2',
    },
    {
      id: 'display',
      label: '顯示',
      settingsReturnLabel: '顯示',
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
