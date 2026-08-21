export const OUTPUT_TEMPLATE_KINDS = Object.freeze([
  { id: 'now-playing', label: 'Now Playing' },
  { id: 'setlist', label: 'Setlist' },
  { id: 'lyrics', label: 'Lyrics' },
  { id: 'artwork', label: 'Artwork' },
  { id: 'composite', label: 'Composite' },
]);

const OUTPUT_KIND_ORDER = new Map(
  OUTPUT_TEMPLATE_KINDS.map((kind, index) => [kind.id, index]),
);

export const OUTPUT_TEMPLATES = Object.freeze([
  {
    id: 'now-next',
    kind: 'now-playing',
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
    kind: 'setlist',
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
    id: 'focus-line',
    kind: 'lyrics',
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
    kind: 'lyrics',
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
    kind: 'lyrics',
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
  {
    id: 'art-card',
    kind: 'artwork',
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
]);

export const OUTPUT_STYLE_SETS = Object.freeze([
  {
    id: 'runtime-source',
    kind: 'layout',
    name: '輸出來源',
    status: 'Base',
    tone: 'accent',
    summary: 'Browser Source、透明背景與本機 URL 的第一版輸出契約。',
    tokens: [
      { label: '路徑', value: 'Local HTTP' },
      { label: '狀態', value: '手動接入' },
      { label: '背景', value: 'transparent' },
    ],
  },
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
]);

export const OUTPUT_PROFILES = Object.freeze([
  {
    id: 'default-now-next',
    name: '直播角落歌名',
    summary: '目前曲目與下一首，半透明深色底。',
    source: 'Now / Next',
    templateId: 'now-next',
    updatedAt: '剛剛',
    status: '草稿',
    active: true,
  },
  {
    id: 'waiting-board',
    name: '等待畫面歌單板',
    summary: '顯示 8 首待播歌曲與已唱紀錄。',
    source: 'Queue Board',
    templateId: 'queue-board',
    updatedAt: '尚未保存',
    status: '未保存',
    active: false,
  },
  {
    id: 'default-focus',
    name: '置中即時歌詞',
    summary: '目前行置中，保留柔和描邊與淡入淡出。',
    source: 'Focus Line',
    templateId: 'focus-line',
    updatedAt: '尚未保存',
    status: '草稿',
    active: false,
  },
]);

function normalizeOrder(value) {
  return Number.isFinite(value) ? value : 100;
}

function kindRank(kind) {
  return OUTPUT_KIND_ORDER.has(kind)
    ? OUTPUT_KIND_ORDER.get(kind)
    : OUTPUT_KIND_ORDER.size;
}

function labelForKind(kind) {
  return (
    OUTPUT_TEMPLATE_KINDS.find((entry) => entry.id === kind)?.label ??
    kind
      .split('-')
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ')
  );
}

export function orderOutputTemplates(templates) {
  return [...templates].sort((a, b) => {
    const kindDelta = kindRank(a.kind) - kindRank(b.kind);
    if (kindDelta !== 0) return kindDelta;

    const orderDelta = normalizeOrder(a.order) - normalizeOrder(b.order);
    if (orderDelta !== 0) return orderDelta;

    return a.name.localeCompare(b.name);
  });
}

export function groupOutputTemplatesByKind(templates = OUTPUT_TEMPLATES) {
  const groups = new Map();

  for (const template of orderOutputTemplates(templates)) {
    if (!groups.has(template.kind)) groups.set(template.kind, []);
    groups.get(template.kind).push(template);
  }

  return [...groups.entries()].map(([kind, items]) => ({
    kind,
    label: labelForKind(kind),
    templates: items,
  }));
}

export function getDefaultOutputProfile() {
  return (
    OUTPUT_PROFILES.find((profile) => profile.active) ?? OUTPUT_PROFILES[0]
  );
}

export function getOutputWorkbenchData() {
  return {
    templates: orderOutputTemplates(OUTPUT_TEMPLATES),
    templateGroups: groupOutputTemplatesByKind(OUTPUT_TEMPLATES),
    styleSets: [...OUTPUT_STYLE_SETS],
    configs: [...OUTPUT_PROFILES],
  };
}
