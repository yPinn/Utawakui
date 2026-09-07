export const UI_DEMO_GROUPS = Object.freeze([
  {
    key: 'foundations',
    title: '基礎規範',
    description: '先分離系統、Folder 與狀態色的責任，再確認文字與尺度。',
    sections: [
      { key: 'system-palette', title: '系統預設色' },
      { key: 'folder-palette', title: 'Folder 高彩度參考' },
      { key: 'status-palette', title: 'Mildliner 狀態色' },
      { key: 'typography', title: '文字層級' },
      { key: 'spacing-shape', title: '間距與形狀' },
      { key: 'core-minimums', title: '核心最小尺寸' },
      { key: 'density', title: '密度與尺寸' },
      {
        key: 'page-header',
        title: '頁面標題列',
        components: ['UiPageHeader'],
      },
    ],
  },
  {
    key: 'inputs',
    title: '輸入元件',
    description: '由搜尋入口到完整欄位狀態，確認標籤、提示與錯誤關係。',
    sections: [
      { key: 'field', title: '欄位共用外觀', components: ['UiField'] },
      {
        key: 'search-box',
        title: '搜尋欄',
        components: ['UiSearchBox'],
      },
      {
        key: 'text-field',
        title: '文字欄位',
        components: ['UiTextField'],
      },
      {
        key: 'textarea',
        title: '多行文字',
        components: ['UiTextarea'],
      },
      { key: 'select', title: '選擇欄位', components: ['UiSelect'] },
      {
        key: 'checkbox',
        title: '核取方塊',
        components: ['UiCheckbox'],
      },
      { key: 'range', title: '範圍控制', components: ['UiRange'] },
    ],
  },
  {
    key: 'actions',
    title: '操作元件',
    description: '由主要／次要動作到緊湊的圖示與文字操作。',
    sections: [
      { key: 'buttons', title: '按鈕', components: ['UiButton'] },
      {
        key: 'icon-buttons',
        title: '圖示按鈕',
        components: ['UiIconButton'],
      },
      {
        key: 'text-button',
        title: '文字按鈕',
        components: ['UiTextButton'],
      },
    ],
  },
  {
    key: 'navigation',
    title: '導覽元件',
    description: '展示單一工作區內的層級切換與鍵盤方向鍵行為。',
    sections: [{ key: 'tabs', title: '分頁導覽', components: ['UiTabs'] }],
  },
  {
    key: 'feedback',
    title: '狀態與回饋',
    description: '從低干擾狀態到需要回應的訊息，依資訊強度排列。',
    sections: [
      { key: 'chips', title: '狀態標籤', components: ['UiChip'] },
      {
        key: 'status-icons',
        title: '狀態圖示',
        components: ['UiStatusIcon'],
      },
      { key: 'hints', title: '提示文字', components: ['UiHint'] },
      { key: 'notices', title: '通知訊息', components: ['UiNotice'] },
      { key: 'progress', title: '進度指示', components: ['UiProgress'] },
    ],
  },
  {
    key: 'content',
    title: '內容與媒體',
    description: '長文字、封面與曲目資料列，涵蓋真實密度與多語系溢位。',
    sections: [
      {
        key: 'marquee-text',
        title: '跑馬燈文字',
        components: ['UiMarqueeText'],
      },
      {
        key: 'track-thumb',
        title: '曲目縮圖',
        components: ['UiTrackThumb'],
      },
      {
        key: 'collage-thumb',
        title: '拼貼縮圖',
        components: ['UiCollageThumb'],
      },
      {
        key: 'track-rows',
        title: '曲目資料列',
        components: ['UiTrackRow'],
      },
    ],
  },
  {
    key: 'overlays',
    title: '浮層元件',
    description: '最後檢查離開文件流並管理焦點、關閉與堆疊順序的元件。',
    sections: [
      {
        key: 'context-menu',
        title: '快顯選單',
        components: ['UiContextMenu'],
      },
      { key: 'modal', title: '對話框', components: ['UiModal'] },
    ],
  },
]);
