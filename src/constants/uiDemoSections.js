export const UI_DEMO_GROUPS = Object.freeze([
  {
    key: 'foundations',
    title: 'Foundations',
    description: '先確認頁面層級與文字尺度，再檢查互動元件。',
    sections: [
      { key: 'typography', title: 'Typography' },
      { key: 'page-header', title: 'Page header' },
    ],
  },
  {
    key: 'inputs',
    title: 'Inputs',
    description: '文字輸入與搜尋等資料入口。',
    sections: [
      { key: 'text-field', title: 'Text field' },
      { key: 'search-box', title: 'Search box' },
    ],
  },
  {
    key: 'actions',
    title: 'Actions',
    description: '由一般動作到更精簡的 icon／text affordance。',
    sections: [
      { key: 'buttons', title: 'Buttons' },
      { key: 'icon-buttons', title: 'Icon buttons' },
      { key: 'text-button', title: 'Text button' },
    ],
  },
  {
    key: 'feedback',
    title: 'Status & feedback',
    description: '短狀態、圖示、行內提示與需要採取行動的通知。',
    sections: [
      { key: 'chips', title: 'Chips' },
      { key: 'status-icons', title: 'Status icons' },
      { key: 'hints', title: 'Hints' },
      { key: 'notices', title: 'Notices' },
    ],
  },
  {
    key: 'content',
    title: 'Content & media',
    description: '長文字、封面與歌曲資料列等內容呈現。',
    sections: [
      { key: 'marquee-text', title: 'Marquee text' },
      { key: 'track-thumb', title: 'Track thumb' },
      { key: 'collage-thumb', title: 'Collage thumb' },
      { key: 'track-rows', title: 'Track rows' },
    ],
  },
  {
    key: 'overlays',
    title: 'Overlays',
    description: '會離開一般文件流、需要管理 focus 與 stacking 的元件。',
    sections: [
      { key: 'context-menu', title: 'Context menu' },
      { key: 'modal', title: 'Modal' },
    ],
  },
]);
