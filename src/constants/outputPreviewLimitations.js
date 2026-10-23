const COMMON = '預設外觀示意，實際輸出請至工作臺確認。';
const DETAILS = Object.freeze({
  'queue-board': '捲動示意，正式輸出採逐頁顯示。',
  'receipt-setlist': '使用示例紀錄，正式回顧最多一百筆。',
  'karaoke-stack': '掃色示意，非實際逐字同步。',
  'kinetic-pop': '固定句段示意，未呈現整首換句。',
  'ornate-vertical': '兩句循環示意，未呈現完整換詞。',
  'live-stage': '字卡與字幕為固定時間點示意。',
  'manga-frame': '對白同時展示，未呈現交接與逐字同步。',
  'art-card': '文字封面示意，旋轉不對應播放位置。',
  'cover-player': '封面與進度僅供示意。',
});

export function outputPreviewLimitations(templateId) {
  return [
    COMMON,
    Object.hasOwn(DETAILS, templateId) ? DETAILS[templateId] : '僅供風格參考。',
  ];
}
