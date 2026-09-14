export const UI_DEMO_GROUPS = Object.freeze([
  {
    key: 'foundations',
    title: '基礎規範',
    description: '色彩、文字、尺寸與密度。',
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
      {
        key: 'separator',
        title: '分隔線',
        components: ['UiSeparator'],
        reviewed: false,
      },
      {
        key: 'kbd',
        title: '快捷鍵提示',
        components: ['UiKbd'],
        reviewed: false,
      },
    ],
  },
  {
    key: 'inputs',
    title: '輸入元件',
    description: '欄位 anatomy、狀態、驗證與尺寸。',
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
      {
        key: 'color-field',
        title: '色彩欄位',
        components: ['UiColorField'],
        reviewed: false,
      },
      {
        key: 'radio-group',
        title: '單選群組',
        components: ['UiRadioGroup'],
        reviewed: false,
      },
    ],
  },
  {
    key: 'actions',
    title: '操作元件',
    description: '按鈕、圖示與文字操作。',
    sections: [
      { key: 'buttons', title: '按鈕', components: ['UiButton'] },
      {
        key: 'icon-buttons',
        title: '圖示按鈕',
        components: ['UiIconButton'],
      },
      {
        key: 'text-button',
        title: '文字操作',
        components: ['UiTextButton'],
      },
    ],
  },
  {
    key: 'navigation',
    title: '導覽元件',
    description: '同一工作區內的分頁切換。',
    sections: [
      { key: 'tabs', title: '分頁導覽', components: ['UiTabs'] },
      {
        key: 'segmented-control',
        title: '分段單選',
        components: ['UiSegmentedControl'],
        reviewed: false,
      },
      {
        key: 'disclosure',
        title: '展開區塊',
        components: ['UiDisclosure'],
        reviewed: false,
      },
    ],
  },
  {
    key: 'feedback',
    title: '狀態與回饋',
    description: '狀態標籤、圖示、內嵌通知與進度指示。',
    sections: [
      { key: 'chips', title: '狀態標籤', components: ['UiChip'] },
      {
        key: 'status-icons',
        title: '狀態圖示',
        components: ['UiStatusIcon'],
      },
      { key: 'hints', title: '輔助文字', components: ['UiHint'] },
      { key: 'notices', title: '內嵌通知', components: ['UiNotice'] },
      { key: 'progress', title: '進度指示', components: ['UiProgress'] },
      {
        key: 'skeleton',
        title: '載入骨架',
        components: ['UiSkeleton'],
        reviewed: false,
      },
      {
        key: 'notification-host',
        title: '固定通知 Host',
        components: ['UiNotificationHost'],
        reviewed: false,
      },
    ],
  },
  {
    key: 'content',
    title: '內容與媒體',
    description: '長文字、封面與曲目資料列。',
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
    description: '焦點、關閉與堆疊。',
    sections: [
      {
        key: 'context-menu',
        title: '動作選單',
        components: ['UiActionMenu Candidate', 'UiContextMenu Current'],
      },
      { key: 'modal', title: '對話框', components: ['UiModal'] },
      {
        key: 'tooltip',
        title: '工具提示',
        components: ['UiTooltip'],
        reviewed: false,
      },
      {
        key: 'popover',
        title: '錨定浮層',
        components: ['UiPopover'],
        reviewed: false,
      },
    ],
  },
]);
