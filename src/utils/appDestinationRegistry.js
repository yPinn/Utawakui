import { t } from './i18n.js';

export const APP_DESTINATIONS = Object.freeze(
  [
    {
      id: 'library',
      label: t('destination.library'),
      material: 'primary',
      shortcut: 'f1',
    },
    {
      id: 'performance',
      label: t('destination.performance'),
      material: 'secondary',
      shortcut: 'f2',
    },
    {
      id: 'display',
      label: t('destination.display'),
      material: 'tertiary',
      shortcut: 'f3',
    },
    {
      id: 'settings',
      label: t('destination.settings'),
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
