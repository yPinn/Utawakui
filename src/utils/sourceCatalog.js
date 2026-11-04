import { catalogKey, t } from './i18n.js';
const SOURCE_CATALOG_STATES = new Set([
  'available',
  'not-imported',
  'missing',
  'needs-confirmation',
  'excluded',
  'unlinked',
]);
export function projectSourceCatalogRows(catalog, tracksById) {
  return (catalog?.rows ?? []).map((row) => ({
    ...row,
    track:
      row.state === 'available'
        ? (tracksById.get(row.localTrackId) ?? null)
        : null,
    stateLabel: t(
      `library.sourceStates.${catalogKey(SOURCE_CATALOG_STATES.has(row.state) ? row.state : 'needs-confirmation')}`,
    ),
  }));
}
