// Sampled from the supplied visual reference for comparison only. These values
// are intentionally not promoted into the candidate token sheet.
export const FOLDER_REFERENCE_SWATCHES = [
  { label: 'Cobalt', value: '#1E4BD7', ink: '#FDFAF7' },
  { label: 'Vermilion', value: '#D71E1E', ink: '#FDFAF7' },
  { label: 'Emerald', value: '#0C7866', ink: '#FDFAF7' },
  { label: 'Violet', value: '#581E70', ink: '#FDFAF7' },
  { label: 'Sunflower', value: '#FFE927', ink: '#191A1E' },
];

export const STATUS_COLOR_SWATCHES = [
  {
    label: '一般',
    token: '--ui-color-neutral',
    softToken: '--ui-color-neutral-soft',
    dark: '#B2B8BF',
    light: '#50535B',
  },
  {
    label: '資訊',
    token: '--ui-color-info',
    softToken: '--ui-color-info-soft',
    dark: '#7EC9ED',
    light: '#1D6888',
  },
  {
    label: '完成',
    token: '--ui-color-success',
    softToken: '--ui-color-success-soft',
    dark: '#95CF96',
    light: '#2F6F45',
  },
  {
    label: '注意',
    token: '--ui-color-warning',
    softToken: '--ui-color-warning-soft',
    dark: '#EBC669',
    light: '#705500',
  },
  {
    label: '即時',
    token: '--ui-color-live',
    softToken: '--ui-color-live-soft',
    dark: '#F79494',
    light: '#A33F43',
  },
  {
    label: '危險',
    token: '--ui-color-danger',
    softToken: '--ui-color-danger-soft',
    dark: '#F79494',
    light: '#A33F43',
  },
];

export const STATUS_ROLE_SAMPLES = [
  {
    key: 'current',
    label: '播放中',
    token: '--ui-color-accent',
    cue: '播放圖示＋列側線',
  },
  {
    key: 'live',
    label: '即時輸出',
    token: '--ui-color-live',
    cue: '圓點＋LIVE 標籤',
  },
  {
    key: 'danger',
    label: '危險／錯誤',
    token: '--ui-color-danger',
    cue: '× 圖示＋訊息／操作',
  },
];
