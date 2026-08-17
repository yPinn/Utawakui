<script setup>
import ObsDisplayWorkbench from '../components/output/ObsDisplayWorkbench.vue';

const presets = [
  {
    id: 'now-next',
    order: 10,
    name: 'Now / Next',
    tone: 'stage',
    availability: {
      label: '建議',
      tone: 'accent',
      summary: '不依賴 artwork，適合作為對外輸出 gate 開啟後的預設起點。',
    },
    summary: '直播中最常用的目前曲目與下一首資訊。',
    detail: '適合小面積放在角落，保留歌名、歌手與下一首提示。',
    preview: {
      title: 'Now Singing',
      lines: ['夜に駆ける / YOASOBI', 'Next: Stellar Stellar'],
    },
    tags: ['低干擾', '角落顯示', '基本資訊'],
    settings: [
      { label: '顯示', value: '目前曲目、下一首' },
      { label: '密度', value: 'Compact' },
      { label: '背景', value: '透明 / 半透明底' },
    ],
  },
  {
    id: 'queue-board',
    order: 20,
    name: 'Queue Board',
    tone: 'minimal',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '只依賴歌單與曲目文字資料，適合等待畫面或幕間使用。',
    },
    summary: '給觀眾查看待播與已唱曲目的歌單板。',
    detail: '適合等待畫面或幕間，強調隊列順序與歌單狀態。',
    preview: {
      title: 'Setlist',
      lines: ['01  Stellar Stellar', '02  怪物', '03  群青'],
    },
    tags: ['待播清單', '已唱紀錄', '幕間'],
    settings: [
      { label: '顯示', value: '已唱、待播、目前曲目' },
      { label: '密度', value: 'Readable' },
      { label: '行數', value: '5 - 12 rows' },
    ],
  },
  {
    id: 'art-card',
    order: 90,
    name: 'Artwork Card',
    tone: 'lyrics',
    availability: {
      label: '受限',
      tone: 'warning',
      summary:
        '目前對外輸出路徑先限制 artwork 顯示；此模板保留為後續開放項，因此排在後方。',
    },
    summary: '以封面與曲目 metadata 作為主要視覺，需等待 artwork 顯示開放。',
    detail: '適合封面素材完整的曲庫；目前先作為後續支援的版型參考。',
    preview: {
      title: 'Cover / Title',
      lines: ['Artist: 星街すいせい', 'Artwork pending'],
    },
    tags: ['封面', 'Metadata', '節目卡'],
    settings: [
      { label: '顯示', value: '封面、歌名、歌手' },
      { label: '比例', value: '16:9 / 1:1 preview' },
      { label: '狀態', value: '播放中、下一首' },
    ],
  },
];

const configs = [
  {
    id: 'default-now-next',
    name: '直播角落歌名',
    summary: '目前曲目與下一首，半透明深色底。',
    source: 'Now / Next',
    updatedAt: '剛剛',
    status: '草稿',
    active: true,
  },
  {
    id: 'waiting-board',
    name: '等待畫面歌單板',
    summary: '顯示 8 首待播歌曲與已唱紀錄。',
    source: 'Queue Board',
    updatedAt: '尚未保存',
    status: '未保存',
    active: false,
  },
];

const styleSets = [
  {
    id: 'setlist-type',
    kind: 'typography',
    name: '字體層級',
    status: 'Base',
    tone: 'accent',
    summary: '歌名、歌手、Next 標籤與序號的大小和字重。',
    tokens: [
      { label: '標題', value: 'lg / heavy' },
      { label: '資訊', value: 'sm / muted' },
      { label: '行高', value: '1.25' },
    ],
  },
  {
    id: 'setlist-layout',
    kind: 'layout',
    name: '排列與密度',
    status: 'Draft',
    tone: 'muted',
    summary: '文字型模板的間距、行數與資訊密度。',
    tokens: [
      { label: '間距', value: 'compact' },
      { label: '行數', value: '5 - 12' },
      { label: '比例', value: '16:9 / 1:1' },
    ],
  },
  {
    id: 'setlist-surface',
    kind: 'surface',
    name: '背景與遮罩',
    status: 'Draft',
    tone: 'muted',
    summary: '透明底、半透明底、文字遮罩與 border 狀態。',
    tokens: [
      { label: '背景', value: 'transparent' },
      { label: '遮罩', value: 'soft' },
      { label: '邊框', value: 'optional' },
    ],
  },
];
</script>

<template>
  <ObsDisplayWorkbench
    :presets="presets"
    :style-sets="styleSets"
    :configs="configs"
  />
</template>
