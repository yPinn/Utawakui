const COMMON =
  '此處展示預設外觀與合成動態示意；自訂設定與實際輸出請在工作臺確認。';
const DETAILS = Object.freeze({
  'queue-board': '縮略捲動不代表正式輸出的逐頁顯示。',
  'receipt-setlist': '以合成紀錄預覽；正式回顧最多最近一百筆已唱明細。',
  'karaoke-stack': '掃色只作示意，不代表逐字同步結果。',
  'kinetic-pop': '只展示固定句段，不展示整首換句時序。',
  'ornate-vertical': '兩句循環只作示意，不代表完整換詞時序。',
  'live-stage': '標題卡與字幕展示固定時間點。',
  'manga-frame': '對白同時展示，不代表逐框交接與逐字同步。',
  'art-card': '封面以文字代圖；旋轉不代表實際播放位置。',
  'cover-player': '封面以文字代圖；動態進度只作示意。',
});

export function outputPreviewLimitations(templateId) {
  return [
    COMMON,
    Object.hasOwn(DETAILS, templateId) ? DETAILS[templateId] : '僅供風格參考。',
  ];
}
