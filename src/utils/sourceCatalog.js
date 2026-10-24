export const SOURCE_CATALOG_STATES = Object.freeze({
  available: '本地可用',
  'not-imported': '未匯入',
  missing: '檔案遺失',
  'needs-confirmation': '待確認',
  excluded: '已排除此專輯',
  unlinked: '尚未納入專輯',
});
export function projectSourceCatalogRows(catalog, tracksById) {
  return (catalog?.rows ?? []).map((row) => ({
    ...row,
    track:
      row.state === 'available'
        ? (tracksById.get(row.localTrackId) ?? null)
        : null,
    stateLabel: SOURCE_CATALOG_STATES[row.state] ?? '待確認',
  }));
}
