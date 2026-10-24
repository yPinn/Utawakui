export const METADATA_LABELS = {
  title: '曲名',
  artist: '演唱者',
  album: '專輯',
  albumArtist: '專輯藝人',
  releaseDate: '發行日期',
  releaseYear: '發行年份',
  trackNumber: '曲號',
  trackTotal: '總曲數',
  discNumber: '碟號',
  discTotal: '總碟數',
};
export const MERGE_LABELS = {
  name: '名稱',
  description: '說明',
  type: '發行類型',
  date: '發行日期',
  totalTrackCount: '總曲數',
};
export function displayMetadata(value) {
  if (value === null || value === undefined) return '未提供';
  if (value === '') return '空白';
  if (typeof value === 'object')
    return typeof value.value === 'string' ? value.value : '未提供';
  return String(value);
}
export function reconciliationReason(reason) {
  return (
    {
      'verified-release-members':
        '發行成員及目前音源皆相符，可比較後確認合併。',
      'unverified-media': '音源缺失、已變更或尚未確認，暫時無法合併。',
      'different-source': '屬於不同來源發行，保留各自曲序與關聯。',
      'different-tracklist': '發行類型或完整曲序不同，暫時無法合併。',
      RECONCILIATION_ASSET_CONFLICT:
        '頁面物件有衝突，請先整理兩張作品的便條或照片。',
      RECONCILIATION_ASSET_LIMIT:
        '合併後頁面物件超過上限，請先整理便條或照片。',
    }[reason] ?? '請先比較兩張作品的資料。'
  );
}
export function reconciliationItemLabel(kind) {
  return (
    {
      metadata: '曲目資訊',
      'duplicate-file': '相同音檔',
      'changed-file': '音源已變更',
      'missing-file': '缺少音檔',
      'tags-unavailable': '無法讀取標籤',
      'release-pair': '發行檢查',
    }[kind] ?? '待檢查'
  );
}
