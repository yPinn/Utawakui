import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import {
  OUTPUT_APPEARANCE_DEFAULTS,
  OUTPUT_SLOT_APPEARANCE_DEFAULTS,
  outputAppearanceFieldsForTemplate,
  outputElementTargetsForTemplate,
} from '../../shared/outputAppearance.mjs';
import { lyricsPresentationProfileForTemplate } from '../../shared/presentation/lyricsPresentation.mjs';
import {
  lyricsPresentationPolicyOptionsForTemplate,
  normalizeLyricsPresentationPolicyId,
} from '../../shared/presentation/lyricsPresentationPolicies.mjs';
import { lyricsTemplateCapabilities } from '../../shared/presentation/lyricsTemplateCapabilities.mjs';
import { defaultCaptureSizeIdForKind } from './outputCaptureSizes.js';
import { createOutputPreviewScene } from '../../shared/presentation/outputPreviewScene.mjs';
import { UI_LOCALE } from '../utils/uiLocale.js';

export const OUTPUT_TEMPLATE_KINDS = Object.freeze(
  OUTPUT_TEMPLATE_VALUES.slots.map((slot) => ({
    id: slot.id,
    label: slot.label,
  })),
);

const OUTPUT_KIND_ORDER = new Map(
  OUTPUT_TEMPLATE_KINDS.map((kind, index) => [kind.id, index]),
);

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// Immutable compatibility facade; each preview projects this same snapshot for its template.
export const OUTPUT_PREVIEW_SCENE = deepFreeze(createOutputPreviewScene());

const OUTPUT_TEMPLATE_DEFINITIONS = [
  {
    id: 'receipt-setlist',
    kind: 'setlist',
    order: 10,
    name: '票據歌單',
    availability: { summary: '演出安排顯示已唱明細，一般播放顯示紀錄。' },
    summary: '熱感小票風格的曲目與已唱紀錄。',
    detail: '唱完自動出紙，可切換方向並定時回顧已唱明細。',
    preview: { layoutLabel: '連續小票', motionLabel: '送紙與回顧' },
    tags: ['熱感小票', '雙向出紙', '歷史回顧'],
    settings: [
      { label: '顯示', value: '目前曲目、已唱明細' },
      { label: '方向', value: '預設向下，可選向上' },
      { label: '曲名', value: '最多兩行，超長省略' },
      { label: '回顧', value: '定時回顧，可關閉' },
    ],
  },
  {
    id: 'queue-board',
    kind: 'setlist',
    order: 20,
    name: '夜色歌單',
    availability: {
      summary: '使用目前曲目與已唱紀錄。',
    },
    summary: '黑底細線風格的演唱紀錄。',
    detail: '目前曲目置頂，已唱紀錄向下累積並平順滾動。',
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
    id: 'karaoke-stack',
    kind: 'lyrics',
    order: 10,
    name: '經典字幕',
    availability: {
      summary: '支援逐字掃色，無逐字資料時依行長估算。',
    },
    summary: '雙行交替、倒數與逐字掃色。',
    detail: '雙行交替接唱，提示點先行倒數，文字隨進度掃色。',
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
    name: '分格對白',
    availability: {
      summary: '使用目前行，可顯示已有的日文讀音。',
    },
    summary: '左右交替的漫畫直書對白。',
    detail: '歌詞分成一至三個直書對話框，隨句左右交替。',
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
    name: '躍動字幕',
    availability: {
      summary: '使用逐行歌詞。',
    },
    summary: '漸層粗體字，逐字交錯跳入。',
    detail: '文字定點交錯跳入，可固定或輪替三款材質。',
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
    id: 'ornate-vertical',
    kind: 'lyrics',
    order: 28,
    name: '和風直書',
    availability: {
      summary: '使用逐行歌詞，自動組合日文漢字。',
    },
    summary: '明朝直書，漢字成組、假名逐字呈現。',
    detail: '明朝體直書，長句自動分欄；可調字色、大小與位置。',
    preview: {
      layoutLabel: '華麗直書',
      motionLabel: '群字綴現',
    },
    tags: ['日文直書', '漢字群組', '墨色殘影'],
    settings: [
      { label: '顯示', value: '目前行' },
      { label: '排版', value: '直書、固定右側' },
      { label: '長句', value: '自動拆成至多兩欄' },
      { label: '切換', value: '漢字成組、假名逐字' },
      { label: '藝術字', value: '同尺寸輕墨層' },
      { label: '字型', value: '日文明朝體' },
      { label: '背景', value: '透明' },
    ],
  },
  {
    id: 'live-stage',
    kind: 'lyrics',
    order: 20,
    name: '舞台字幕',
    availability: {
      summary: '需逐行時間，開場字卡使用曲目資訊。',
    },
    summary: '轉播風格的歌詞與開場字卡。',
    detail: '歌詞置於左下、開場字卡置於右下，中央留給表演者。',
    preview: {
      layoutLabel: '舞台雙行',
      motionLabel: '字卡進場',
    },
    tags: ['轉播字幕', '開場字卡', '舞台識別'],
    settings: [
      { label: '歌詞', value: '左下寬幅、最多兩行' },
      { label: '呈現', value: '精簡、平衡或忠實原文' },
      { label: '字卡', value: '右下精簡、播放後四至八秒' },
      { label: '成員', value: '解析但不顯示' },
      { label: '品牌', value: '上方低干擾舞台識別' },
    ],
  },
  {
    id: 'art-card',
    kind: 'now-playing',
    order: 10,
    name: '星空黑膠',
    availability: {
      summary: '使用本機封面，缺圖時顯示曲名首字。',
    },
    summary: '專輯封面搭配星染黑膠。',
    detail: '左側封面、右側星染唱盤，隨播放緩慢旋轉。',
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
    name: '封面電台',
    availability: {
      summary: '使用本機封面，缺圖時顯示曲名首字。',
    },
    summary: '大幅封面搭配取色背景與播放進度。',
    detail: '直式播放器，呈現封面、曲目、進度與音量。',
    preview: {
      layoutLabel: '直式封面卡',
      motionLabel: '進度同步',
    },
    tags: ['大幅封面', '播放進度', '播放狀態'],
    settings: [
      { label: '顯示', value: '封面、歌名、歌手、進度' },
      { label: '控制列', value: '僅顯示播放狀態' },
      { label: '缺圖', value: '曲名首字替代' },
    ],
  },
];

const EMPTY_PRESENTATION_FIELDS = Object.freeze([]);
const CONTENT_CONFIGURATION_GROUP = Object.freeze({
  id: 'template-presentation',
  label: '模板進階顯示',
  order: 90,
});

function presentationFieldsForTemplate(templateId) {
  const options = lyricsPresentationPolicyOptionsForTemplate(templateId);
  if (options.length === 0) return EMPTY_PRESENTATION_FIELDS;
  return Object.freeze([
    Object.freeze({
      key: 'lyricsPresentationPolicyId',
      label: '歌詞呈現策略',
      control: 'select',
      settingKind: 'lyrics-presentation',
      family: 'document',
      tier: 'basic',
      reflow: true,
      scope: 'template',
      group: CONTENT_CONFIGURATION_GROUP.id,
      groupLabel: CONTENT_CONFIGURATION_GROUP.label,
      groupOrder: CONTENT_CONFIGURATION_GROUP.order,
      order: 20,
      defaultValue: normalizeLyricsPresentationPolicyId(templateId),
      options: Object.freeze(options.map((option) => Object.freeze(option))),
    }),
  ]);
}

const DEFAULT_TEMPLATE_IDS = new Set(
  OUTPUT_TEMPLATE_VALUES.slots.map((slot) => slot.defaultTemplateId),
);

// Labels follow state: each slot's default is 建議, the rest are 可用.
function availabilityForTemplate(template, available = true) {
  const status = !available
    ? { status: 'unavailable', label: '尚未提供', tone: 'warning' }
    : DEFAULT_TEMPLATE_IDS.has(template.id)
      ? { status: 'recommended', label: '建議', tone: 'accent' }
      : { status: 'available', label: '可用', tone: 'muted' };
  return Object.freeze({ ...template.availability, ...status, available });
}

export const OUTPUT_TEMPLATES = Object.freeze(
  OUTPUT_TEMPLATE_DEFINITIONS.map((template) => {
    const appearanceFields = outputAppearanceFieldsForTemplate(template.id);
    const presentationFields = presentationFieldsForTemplate(template.id);
    const elementTargets = outputElementTargetsForTemplate(template.id);
    if (template.kind !== 'lyrics') {
      return Object.freeze({
        ...template,
        availability: availabilityForTemplate(template),
        appearanceFields,
        presentationFields,
        elementTargets,
      });
    }
    const presentationProfile = lyricsPresentationProfileForTemplate(
      template.id,
    );
    return Object.freeze({
      ...template,
      availability: availabilityForTemplate(
        template,
        presentationProfile.available,
      ),
      editableAppearanceKeys: [...presentationProfile.editableAppearanceKeys],
      appearanceFields,
      presentationFields,
      elementTargets,
      lyricsCapabilities: lyricsTemplateCapabilities(template.id),
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
    summary: 'Simple Black B 以目前歌曲焦點區與彈性已唱紀錄構成。',
    tokens: [
      { label: '目前', value: '約 20%' },
      { label: '間隔', value: '語意留白' },
      { label: '歷史', value: '彈性填滿' },
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
          ...(OUTPUT_SLOT_APPEARANCE_DEFAULTS[slot.id] ??
            OUTPUT_APPEARANCE_DEFAULTS),
          captureSize: defaultCaptureSizeIdForKind(slot.id),
        },
      },
    ]),
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

    return a.name.localeCompare(b.name, UI_LOCALE);
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
  };
}
