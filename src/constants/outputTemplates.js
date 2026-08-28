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
  label: '固定示例 · 中文',
  track: Object.freeze({
    title: '如果可以',
    artist: '韋禮安',
  }),
  nextTrack: Object.freeze({
    title: '小幸運',
    artist: '田馥甄',
  }),
  queue: Object.freeze([
    Object.freeze({ number: '01', title: '如果可以', state: 'current' }),
    Object.freeze({ number: '02', title: '小幸運', state: 'upcoming' }),
    Object.freeze({
      number: '03',
      title: '刻在我心底的名字',
      state: 'upcoming',
    }),
  ]),
  lyrics: Object.freeze({
    current: '目前歌詞',
    next: '下一句',
    reading: '歌詞讀音',
  }),
});

const OUTPUT_TEMPLATE_DEFINITIONS = [
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
      layoutLabel: '角落資訊',
      motionLabel: '滑入',
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
      layoutLabel: '清單板',
      motionLabel: '逐列更新',
    },
    tags: ['待播清單', '已唱紀錄', '幕間'],
    settings: [
      { label: '顯示', value: '已唱、待播、目前曲目' },
      { label: '密度', value: 'Readable' },
      { label: '行數', value: '最多 8 列' },
    ],
  },
  {
    id: 'quiet-caption',
    kind: 'lyrics',
    order: 5,
    name: 'Quiet Caption',
    tone: 'minimal',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '只需要目前行文字；不依賴逐字或音樂段落資料。',
    },
    summary: '低干擾的兩行歌詞，讓畫面與演出保持主角。',
    detail: '拿掉多餘面板與裝飾，只保留清楚的目前行與輕量下一句。',
    preview: {
      layoutLabel: '極簡雙行',
      motionLabel: '淡入',
    },
    tags: ['低干擾', '純文字', '目前行 fallback'],
    settings: [
      { label: '顯示', value: '目前行、下一行' },
      { label: '表面', value: '預設透明' },
      { label: '資料', value: '不要求逐字歌詞' },
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
    summary: '目前歌詞行置中，下一行降低存在感。',
    detail: '適合多數歌回場景，讓觀眾視線集中在當前演唱行。',
    preview: {
      layoutLabel: '焦點單行',
      motionLabel: '淡入',
    },
    tags: ['當前行', '下一行', '高可讀'],
    settings: [
      { label: '顯示', value: '目前行、下一行' },
      { label: '文字', value: '描邊、陰影、置中' },
      { label: '切換', value: 'Fade' },
    ],
  },
  {
    id: 'karaoke-stack',
    kind: 'lyrics',
    order: 20,
    name: 'Classic KTV',
    tone: 'stage',
    availability: {
      label: '可用',
      tone: 'muted',
      summary:
        '一般同步歌詞會依行時長與可見字／詞數估算掃色；有 T2 逐字資料時改用精確進度。',
    },
    summary: '重現華語 KTV／MV 常見的白字、藍框與雙行錯位字幕。',
    detail:
      '保留透明輸出，只在畫面下緣顯示兩行粗體歌詞；A 列固定在上方靠左，B 列固定在下方靠右，演唱逐行交替。下一段歌詞與四個提示點會一起預先顯示，再依歌曲 BPM／beat grid 對齊最後一個 4／4 小節正常倒數；間奏期間不會提早露出，唱完的列短暫保留後替換。未唱文字使用白色填滿與深藍粗框，唱過文字使用角色色填滿與等距白邊；一般同步歌詞依行時長與可見字／詞數估算掃色，T2 則使用逐字／逐段精確進度。',
    preview: {
      layoutLabel: '經典 KTV 雙行',
      motionLabel: '由左至右掃色',
    },
    tags: ['華語 KTV', '錯位雙行', 'T1／T2 掃色'],
    settings: [
      { label: '顯示', value: 'A 上左、B 下右，逐行交替' },
      { label: '倒數', value: '歌詞與四點同時出現，依 BPM 倒數' },
      { label: '換詞', value: '唱完短暫保留 0.6 秒' },
      { label: '外觀', value: '白字深藍框、唱過角色色配白邊' },
      { label: '進度', value: 'T1 字／詞估算、T2 精確掃色' },
      { label: '背景', value: '固定透明' },
    ],
  },
  {
    id: 'manga-frame',
    kind: 'lyrics',
    order: 30,
    name: 'Manga Frame',
    tone: 'manga',
    availability: {
      label: '可用',
      tone: 'muted',
      summary: '只要有目前行文字就會顯示黑白對話框；逐字資料只增加網點進度。',
    },
    summary: '每個斷句各自成為一個在人物左右交替的黑白直書漫畫對話框。',
    detail:
      '只顯示當下歌詞並以直書置中；日中歌詞的行內空格會拆成最多三個獨立對話框，括號內容另成背景聲候選框。框組依目前行切換人物左右，換句時所有 SVG 外框與文字一同淡出、淡入。',
    preview: {
      layoutLabel: '漫畫直書單句',
      motionLabel: '整框淡入淡出',
    },
    tags: ['黑白漫畫', '左右多框', '目前行 fallback'],
    settings: [
      { label: '顯示', value: '目前行的 1–3 個斷句' },
      { label: '排版', value: '直書置中、左右交替' },
      { label: '分句', value: '日中空格、括號候選' },
      { label: '切換', value: '外框與文字同步 Fade' },
      { label: '進度', value: '文字後方網點' },
    ],
  },
  {
    id: 'live-stage',
    kind: 'lyrics',
    order: 25,
    name: 'Live Stage',
    tone: 'stage',
    availability: {
      label: '可用',
      tone: 'muted',
      summary:
        '只要有目前行文字就會顯示歌詞；開場字卡只使用既有曲名與歌手資料。',
    },
    summary: '舞台轉播風格的左下雙行歌詞與右下開場曲目字卡。',
    detail:
      '歌詞完全跟隨原始時間，開場字卡則在播放後 4–8 秒獨立顯示；開頭方括號會解析為隱藏的成員 metadata。',
    preview: {
      layoutLabel: '舞台轉播字幕',
      motionLabel: '獨立字卡時間軸',
    },
    tags: ['轉播字幕', '開場字卡', '目前行 fallback'],
    settings: [
      { label: '歌詞', value: '左下、最多兩行' },
      { label: '字卡', value: '右下、播放後 4–8 秒' },
      { label: '成員', value: '解析但不顯示' },
      { label: '品牌', value: 'Utawakui 原創舞台識別' },
    ],
  },
  {
    id: 'reading-aid',
    kind: 'lyrics',
    order: 80,
    name: 'Reading Aid',
    tone: 'minimal',
    availability: {
      available: false,
      label: '尚未提供',
      tone: 'warning',
      summary: 'runtime 尚未傳輸 reading 資料；目前只保留設計預覽，不能套用。',
    },
    summary: '保留讀音輔助行，支援未來 furigana / romaji 顯示。',
    detail: '適合日文、韓文或跨語言歌詞練唱與觀眾跟唱。',
    preview: {
      layoutLabel: '歌詞＋讀音',
      motionLabel: '逐行切換',
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
      label: '可用',
      tone: 'muted',
      summary:
        '優先使用本機曲目封面；缺圖或載入失敗時以曲名首字維持可辨識內容。',
    },
    summary: '以本機封面與曲目 metadata 構成獨立節目卡。',
    detail: '適合需要比角落歌名更明確的曲目識別畫面，缺圖時仍可閱讀。',
    preview: {
      layoutLabel: '封面節目卡',
      motionLabel: '揭示',
    },
    tags: ['封面', 'Metadata', '節目卡'],
    settings: [
      { label: '顯示', value: '封面、歌名、歌手' },
      { label: '比例', value: '16:9 / 1:1 preview' },
      { label: '狀態', value: '播放中、下一首' },
    ],
  },
  {
    id: 'cover-player',
    kind: 'artwork',
    order: 100,
    name: 'Cover Player',
    tone: 'minimal',
    availability: {
      label: '可用',
      tone: 'muted',
      summary:
        '使用現有播放時間與本機封面；缺少 duration 或封面時仍有穩定 fallback。',
    },
    summary: '大封面、曲目資訊與播放器控制列構成的直式節目卡。',
    detail:
      '參考音樂播放器的窄版構圖；控制圖示為唯讀狀態提示，不會在 OBS 中提供互動。',
    preview: {
      layoutLabel: '直式播放器',
      motionLabel: '進度同步',
    },
    tags: ['大封面', '播放進度', '唯讀播放器'],
    settings: [
      { label: '顯示', value: '封面、歌名、歌手、進度' },
      { label: '控制列', value: '唯讀播放狀態' },
      { label: '缺圖', value: '曲名首字 fallback' },
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
    summary: '文字型模板的間距、行數與資訊密度。',
    tokens: [
      { label: '間距', value: 'compact' },
      { label: '行數', value: '最多 8 列' },
      { label: '比例', value: '16:9 / 1:1' },
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
