<script setup>
import ObsDisplayWorkbench from '../components/output/ObsDisplayWorkbench.vue';

const presets = [
  {
    id: 'focus-line',
    order: 10,
    name: 'Focus Line',
    tone: 'lyrics',
    availability: {
      label: '建議',
      tone: 'accent',
      summary: '不依賴 artwork，適合作為歌詞 overlay 的預設起點。',
    },
    summary: '目前歌詞行置中，前後行降低存在感。',
    detail: '適合多數歌回場景，讓觀眾視線集中在當前演唱行。',
    preview: {
      title: 'Lyrics',
      lines: ['一つずつ こぼした音が', '重なって歌になる'],
    },
    tags: ['當前行', '前後行', '高可讀'],
    settings: [
      { label: '顯示', value: '目前行、上一行、下一行' },
      { label: '文字', value: '描邊、陰影、置中' },
      { label: '切換', value: 'Fade' },
    ],
  },
  {
    id: 'karaoke-stack',
    order: 20,
    name: 'Karaoke Stack',
    tone: 'stage',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '依賴 synced lyrics；沒有同步歌詞時可退回文字行顯示。',
    },
    summary: '雙行歌詞與進度提示，保留下一句預告。',
    detail: '適合有 synced lyrics 的曲目，讓換句節奏更清楚。',
    preview: {
      title: 'Now',
      lines: ['走り出した melody', 'Next: まだ見ぬ明日へ'],
    },
    tags: ['雙行', 'Next line', '同步'],
    settings: [
      { label: '顯示', value: '目前行、下一行' },
      { label: '節奏', value: '行進度提示' },
      { label: '背景', value: '半透明遮罩' },
    ],
  },
  {
    id: 'reading-aid',
    order: 80,
    name: 'Reading Aid',
    tone: 'minimal',
    availability: {
      label: '待資料',
      tone: 'warning',
      summary:
        '讀音輔助需要額外 reading 資料；目前先保留在後段，避免被誤認為預設可用。',
    },
    summary: '保留讀音輔助行，支援未來 furigana / romaji 顯示。',
    detail: '適合日文、韓文或跨語言歌詞練唱與觀眾跟唱。',
    preview: {
      title: 'Reading',
      lines: ['星が降る夜に', 'hoshi ga furu yoru ni'],
    },
    tags: ['讀音輔助', '多語', '練唱'],
    settings: [
      { label: '顯示', value: '歌詞行、讀音行' },
      { label: '對齊', value: 'Center / Left' },
      { label: '狀態', value: '無歌詞 fallback' },
    ],
  },
];

const configs = [
  {
    id: 'default-focus',
    name: '置中即時歌詞',
    summary: '目前行置中，保留柔和描邊與淡入淡出。',
    source: 'Focus Line',
    updatedAt: '剛剛',
    status: '草稿',
    active: true,
  },
  {
    id: 'practice-reading',
    name: '讀音輔助版',
    summary: '歌詞下方保留 romanization 行。',
    source: 'Reading Aid',
    updatedAt: '尚未保存',
    status: '未保存',
    active: false,
  },
];

const styleSets = [
  {
    id: 'lyrics-type',
    kind: 'typography',
    name: '歌詞字體',
    status: 'Base',
    tone: 'accent',
    summary: '目前行、前後行、讀音輔助行的字級與字重。',
    tokens: [
      { label: '焦點', value: 'xl / heavy' },
      { label: '前後', value: 'md / muted' },
      { label: '讀音', value: 'sm' },
    ],
  },
  {
    id: 'lyrics-surface',
    kind: 'surface',
    name: '描邊與陰影',
    status: 'Draft',
    tone: 'muted',
    summary: '透明背景上保持可讀性的 stroke、shadow 與遮罩。',
    tokens: [
      { label: '描邊', value: 'strong' },
      { label: '陰影', value: 'soft' },
      { label: '遮罩', value: 'none / soft' },
    ],
  },
  {
    id: 'lyrics-layout',
    kind: 'layout',
    name: '行距與切換',
    status: 'Draft',
    tone: 'muted',
    summary: '歌詞堆疊、Next line、Fade 切換與無歌詞 fallback。',
    tokens: [
      { label: '行數', value: '2 - 3 lines' },
      { label: '切換', value: 'Fade' },
      { label: '對齊', value: 'Center / Left' },
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
