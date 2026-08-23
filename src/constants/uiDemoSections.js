export const UI_DEMO_GROUPS = Object.freeze([
  {
    key: 'foundations',
    title: '基礎規範',
    description: '先確認頁面層級與文字尺度，再檢查互動元件。',
    sections: [
      { key: 'typography', title: '文字層級' },
      { key: 'page-header', title: '頁面標題列' },
    ],
  },
  {
    key: 'inputs',
    title: '輸入元件',
    description: '文字輸入與搜尋等資料入口。',
    sections: [
      { key: 'text-field', title: '文字欄位' },
      { key: 'search-box', title: '搜尋欄' },
    ],
  },
  {
    key: 'actions',
    title: '操作元件',
    description: '由一般動作到更精簡的圖示與純文字操作。',
    sections: [
      { key: 'buttons', title: '按鈕' },
      { key: 'icon-buttons', title: '圖示按鈕' },
      { key: 'text-button', title: '文字按鈕' },
    ],
  },
  {
    key: 'feedback',
    title: '狀態與回饋',
    description: '短狀態、圖示、行內提示與需要採取行動的通知。',
    sections: [
      { key: 'chips', title: '狀態標籤' },
      { key: 'status-icons', title: '狀態圖示' },
      { key: 'hints', title: '提示文字' },
      { key: 'notices', title: '通知訊息' },
    ],
  },
  {
    key: 'content',
    title: '內容與媒體',
    description: '長文字、封面與歌曲資料列等內容呈現。',
    sections: [
      { key: 'marquee-text', title: '跑馬燈文字' },
      { key: 'track-thumb', title: '曲目縮圖' },
      { key: 'collage-thumb', title: '拼貼縮圖' },
      { key: 'track-rows', title: '曲目資料列' },
    ],
  },
  {
    key: 'overlays',
    title: '浮層元件',
    description: '會離開一般文件流、需要管理焦點與堆疊順序的元件。',
    sections: [
      { key: 'context-menu', title: '快顯選單' },
      { key: 'modal', title: '對話框' },
    ],
  },
]);
