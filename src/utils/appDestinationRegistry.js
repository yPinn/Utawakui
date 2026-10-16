export const APP_DESTINATIONS = Object.freeze(
  [
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
