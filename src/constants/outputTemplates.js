import OUTPUT_APPEARANCE_VALUES from '../../shared/outputAppearanceValues.json';
import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import { lyricsPresentationProfileForTemplate } from '../../shared/presentation/lyricsPresentation.mjs';
import { defaultCaptureSizeIdForKind } from './outputCaptureSizes.js';

export const OUTPUT_TEMPLATE_KINDS = Object.freeze(
  OUTPUT_TEMPLATE_VALUES.slots.map((slot) => ({
    id: slot.id,
    label: slot.label,
  })),
);

const OUTPUT_KIND_ORDER = new Map(
  OUTPUT_TEMPLATE_KINDS.map((kind, index) => [kind.id, index]),
);

export const OUTPUT_PREVIEW_SCENE = Object.freeze({
  label: '固定示例 · 多語',
  track: Object.freeze({
    title: '如果可以',
    artist: '韋禮安',
  }),
  nextTrack: Object.freeze({
    title: '小幸運',
    artist: '田馥甄',
  }),
  queue: Object.freeze([
    Object.freeze({
      number: '01',
      title: '小幸運',
      artist: '田馥甄',
      state: 'played',
    }),
    Object.freeze({
      number: '02',
      title: '刻在我心底的名字',
      artist: '盧廣仲',
      state: 'played',
    }),
    Object.freeze({
      number: '03',
      title: '如果可以',
      artist: '韋禮安',
      state: 'current',
    }),
  ]),
  lyrics: Object.freeze({
    current: '目前歌詞',
    next: '下一句',
    reading: '歌詞讀音',
    kinetic: Object.freeze({
      samples: Object.freeze(['選ばれる', 'すてっぷ', '美意識']),
    }),
    manga: Object.freeze({
      current: '地下鉄に飲み込まれる',
      language: 'ja',
      reading: Object.freeze({
        text: '地下鉄に飲み込まれる',
        segments: Object.freeze([
          Object.freeze({ text: '地下鉄', reading: 'ちかてつ' }),
          Object.freeze({ text: 'に' }),
          Object.freeze({ text: '飲み込まれる', reading: 'のみこまれる' }),
        ]),
      }),
    }),
  }),
});

const OUTPUT_TEMPLATE_DEFINITIONS = [
  {
    id: 'now-next',
    kind: 'now-playing',
    order: 20,
    name: '浮光光碟',
    tone: 'stage',
    availability: {
      label: '建議',
      tone: 'accent',
      summary: '不需要封面，即可顯示目前曲目與下一首。',
    },
    summary: '光碟反光與歌曲資訊構成的橫向版面。',
    detail: '左側光碟映出柔和反光，右側並列目前曲目與下一首，適合狹長畫面。',
    preview: {
      layoutLabel: '光碟＋曲目',
      motionLabel: '柔光反射',
    },
    tags: ['透明光碟', '橫向資訊', '輕量動態'],
    settings: [
      { label: '顯示', value: '目前曲目、下一首' },
      { label: '密度', value: '緊湊' },
      { label: '背景', value: '透明／半透明' },
    ],
  },
  {
    id: 'queue-board',
    kind: 'setlist',
    order: 20,
    name: '黑幕歌單',
    tone: 'minimal',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '只需要目前曲目與已唱紀錄。',
    },
    summary: '黑底細線排列目前曲目與已唱紀錄。',
    detail: '目前曲目停在上方，已唱紀錄沿黑幕向下累積；超出範圍後平順滾動。',
    preview: {
      layoutLabel: '目前＋已唱',
      motionLabel: '溢位滾動',
    },
    tags: ['黑底細線', '演唱紀錄', '幕間畫面'],
    settings: [
      { label: '顯示', value: '目前曲目、已唱紀錄' },
      { label: '密度', value: '易讀' },
      { label: '紀錄', value: '最近八首' },
      { label: '動態', value: '超出時滾動' },
    ],
  },
  {
    id: 'quiet-caption',
    kind: 'lyrics',
    order: 40,
    name: '靜語雙行',
    tone: 'minimal',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '只需要目前行與下一行文字。',
    },
    summary: '兩行低干擾字幕，保留畫面呼吸。',
    detail: '目前行清楚、下一行輕淡，讓歌詞安靜融入演出畫面。',
    preview: {
      layoutLabel: '極簡雙行',
      motionLabel: '柔和淡入',
    },
    tags: ['低干擾', '雙行歌詞', '透明背景'],
    settings: [
      { label: '顯示', value: '目前行、下一行' },
      { label: '表面', value: '透明' },
      { label: '資料', value: '不需逐字歌詞' },
    ],
  },
  {
    id: 'focus-line',
    kind: 'lyrics',
    order: 50,
    name: '聚焦歌詞',
    tone: 'lyrics',
    availability: {
      label: '建議',
      tone: 'accent',
      summary: '只需要目前行與下一行文字。',
    },
    summary: '強調目前行，弱化下一行提示。',
    detail: '目前行置中成為視覺焦點，下一行以低對比預告，適合多數演出。',
    preview: {
      layoutLabel: '焦點單行',
      motionLabel: '柔和淡入',
    },
    tags: ['當前行', '下一行', '高可讀'],
    settings: [
      { label: '顯示', value: '目前行、下一行' },
      { label: '文字', value: '描邊、陰影、置中' },
      { label: '切換', value: '淡入淡出' },
    ],
  },
  {
    id: 'karaoke-stack',
    kind: 'lyrics',
    order: 10,
    name: '經典伴唱',
    tone: 'stage',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '有逐字資料時精確掃色，否則依行長平順估算。',
    },
    summary: '雙行錯位字幕搭配倒數與逐字掃色。',
    detail:
      '上下兩列交替接唱，提示點先行倒數，文字隨演唱進度掃色，重現經典伴唱節奏。',
    preview: {
      layoutLabel: '錯位雙行',
      motionLabel: '逐字掃色',
    },
    tags: ['經典伴唱', '錯位雙行', '進度掃色'],
    settings: [
      { label: '顯示', value: '上列靠左、下列靠右' },
      { label: '倒數', value: '依歌曲節拍對齊' },
      { label: '換詞', value: '唱完保留零點六秒' },
      { label: '外觀', value: '白字藍框、角色色掃字' },
      { label: '進度', value: '逐行估算／逐字精確' },
      { label: '背景', value: '透明' },
    ],
  },
  {
    id: 'manga-frame',
    kind: 'lyrics',
    order: 30,
    name: '漫畫對白',
    tone: 'manga',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '只需要目前行；有日文讀音時可顯示假名。',
    },
    summary: '歌詞化為左右交替的直書對話框。',
    detail:
      '當前歌詞拆成一至三個直書對話框，依句切換人物左右，像漫畫分鏡般接續。',
    preview: {
      layoutLabel: '直書對白',
      motionLabel: '整框淡入',
    },
    tags: ['黑白漫畫', '左右對白', '直書歌詞'],
    settings: [
      { label: '顯示', value: '一至三個歌詞斷句' },
      { label: '排版', value: '直書置中、左右交替' },
      { label: '分句', value: '空格與括號分框' },
      { label: '切換', value: '整框淡入淡出' },
      { label: '假名', value: '有資料時顯示' },
    ],
  },
  {
    id: 'kinetic-pop',
    kind: 'lyrics',
    order: 25,
    name: '霓彩跳字',
    tone: 'lyrics',
    availability: {
      label: '可用',
      tone: 'accent',
      summary: '逐行歌詞即可；每段歌詞自動交錯跳入。',
    },
    summary: '粗體漸層白框字，每段逐字交錯跳入。',
    detail:
      '預設使用斜向漸層白框字，也可固定單色或錯位材質，或依句切換三款；文字在定點交錯跳入。',
    preview: {
      layoutLabel: '底部跳字',
      motionLabel: '定點交錯',
    },
    tags: ['日系字卡', '材質可選', '交錯跳字'],
    settings: [
      { label: '顯示', value: '目前行' },
      { label: '材質', value: '預設漸層白框，可固定或輪替' },
      { label: '排列', value: '可選端正或些微偏移' },
      { label: '切換', value: '逐字定點交錯跳入' },
      { label: '字型', value: '日文圓體粗字' },
      { label: '背景', value: '透明' },
    ],
  },
  {
    id: 'live-stage',
    kind: 'lyrics',
    order: 20,
    name: '舞台轉播',
    tone: 'stage',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '只需要目前行；曲目資訊用於開場字卡。',
    },
    summary: '舞台轉播風格的歌詞與開場字卡。',
    detail: '歌詞固定在左下，開場時於右下短暫亮出曲目字卡，保留現場轉播節奏。',
    preview: {
      layoutLabel: '舞台雙行',
      motionLabel: '字卡進場',
    },
    tags: ['轉播字幕', '開場字卡', '舞台識別'],
    settings: [
      { label: '歌詞', value: '左下、最多兩行' },
      { label: '字卡', value: '右下、播放後四至八秒' },
      { label: '成員', value: '解析但不顯示' },
      { label: '品牌', value: 'Utawakui 舞台識別' },
    ],
  },
  {
    id: 'reading-aid',
    kind: 'lyrics',
    order: 80,
    name: '讀音跟唱',
    tone: 'minimal',
    availability: {
      available: false,
      label: '尚未提供',
      tone: 'warning',
      summary: '目前輸出尚未提供讀音資料，暫時不能套用。',
    },
    summary: '在歌詞旁保留假名或羅馬字讀音。',
    detail: '主歌詞與讀音並排呈現，協助日文、韓文與跨語言歌曲跟唱。',
    preview: {
      layoutLabel: '歌詞＋讀音',
      motionLabel: '逐行切換',
    },
    tags: ['讀音輔助', '多語歌詞', '跟唱練習'],
    settings: [
      { label: '顯示', value: '歌詞、讀音' },
      { label: '對齊', value: '置中／靠左' },
      { label: '狀態', value: '無歌詞時顯示提示' },
    ],
  },
  {
    id: 'art-card',
    kind: 'now-playing',
    order: 10,
    name: '星染黑膠',
    tone: 'minimal',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '優先使用本機封面，缺圖時顯示曲名首字。',
    },
    summary: '封面與星染唱盤各半的黑膠播放場景。',
    detail:
      '左側保留專輯封面，右側唱盤染入歌曲色彩與星塵紋理，隨播放緩慢旋轉。',
    preview: {
      layoutLabel: '封面＋唱盤',
      motionLabel: '星塵旋轉',
    },
    tags: ['專輯封面', '星染黑膠', '播放狀態'],
    settings: [
      { label: '顯示', value: '封面、唱盤、歌名、歌手' },
      { label: '動態', value: '播放旋轉、暫停靜止' },
      { label: '缺圖', value: '曲名首字替代' },
    ],
  },
  {
    id: 'cover-player',
    kind: 'now-playing',
    order: 30,
    name: '封面播放卡',
    tone: 'minimal',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '使用本機封面與播放時間，缺少時改用替代顯示。',
    },
    summary: '大封面與播放進度構成的直式節目卡。',
    detail: '大幅封面置於上方，曲目與進度排列在下方，像一張安靜的播放器卡片。',
    preview: {
      layoutLabel: '直式封面卡',
      motionLabel: '進度同步',
    },
    tags: ['大幅封面', '播放進度', '唯讀狀態'],
    settings: [
      { label: '顯示', value: '封面、歌名、歌手、進度' },
      { label: '控制列', value: '僅顯示播放狀態' },
      { label: '缺圖', value: '曲名首字替代' },
    ],
  },
];

export const OUTPUT_TEMPLATES = Object.freeze(
  OUTPUT_TEMPLATE_DEFINITIONS.map((template) => {
    if (template.kind !== 'lyrics') return Object.freeze(template);
    const presentationProfile = lyricsPresentationProfileForTemplate(
      template.id,
    );
    return Object.freeze({
      ...template,
      availability: Object.freeze({
        ...template.availability,
        available: presentationProfile.available,
      }),
      editableAppearanceKeys: [...presentationProfile.editableAppearanceKeys],
      presentationProfile,
    });
  }),
);

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
    summary: 'Simple Black B 的內容比例、留白與已唱溢位滾動。',
    tokens: [
      { label: '上方', value: '目前曲目 3' },
      { label: '間隔', value: '1' },
      { label: '下方', value: '已唱紀錄 6' },
    ],
  },
]);

export const OUTPUT_SLOT_DEFINITIONS = Object.freeze(
  OUTPUT_TEMPLATE_VALUES.slots.map((slot) => ({
    id: slot.id,
    label: slot.label,
    path: slot.path,
  })),
);

export const OUTPUT_SLOT_DEFAULTS = Object.freeze(
  Object.fromEntries(
    OUTPUT_TEMPLATE_VALUES.slots.map((slot) => [
      slot.id,
      {
        templateId: slot.defaultTemplateId,
        styleSetIds: [...slot.defaultStyleSetIds],
        settings: {
          ...(OUTPUT_APPEARANCE_VALUES.slotDefaultSettings[slot.id] ??
            OUTPUT_APPEARANCE_VALUES.defaultSettings),
          captureSize: defaultCaptureSizeIdForKind(slot.id),
        },
      },
    ]),
  ),
);

export const OUTPUT_APPEARANCE_OPTIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(OUTPUT_APPEARANCE_VALUES.appearanceOptions).map(
      ([key, options]) => [key, options.map((option) => ({ ...option }))],
    ),
  ),
);

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

export function getOutputWorkbenchData() {
  return {
    templates: orderOutputTemplates(OUTPUT_TEMPLATES),
    templateGroups: groupOutputTemplatesByKind(OUTPUT_TEMPLATES),
    previewScene: structuredClone(OUTPUT_PREVIEW_SCENE),
    styleSets: [...OUTPUT_STYLE_SETS],
    slotDefinitions: [...OUTPUT_SLOT_DEFINITIONS],
    slotDefaults: structuredClone(OUTPUT_SLOT_DEFAULTS),
    appearanceOptions: structuredClone(OUTPUT_APPEARANCE_OPTIONS),
  };
}
