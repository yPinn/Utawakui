export const OUTPUT_APPEARANCE_SCHEMA_VERSION = 3;

const COLOR_RE = /^#[0-9a-f]{6}$/iu;

const FIELD_DEFINITIONS = [
  {
    key: 'paletteId',
    group: 'color',
    groupLabel: '色彩',
    groupOrder: 10,
    order: 10,
    label: '色盤',
    control: 'select',
    defaultValue: 'original',
    options: [
      { id: 'original', label: '模板原色' },
      { id: 'warm', label: '暖色舞台' },
      { id: 'cool', label: '冷色舞台' },
      { id: 'monochrome', label: '黑白' },
      { id: 'high-contrast', label: '高對比' },
    ],
  },
  {
    key: 'fontFamily',
    group: 'typography',
    groupLabel: '文字',
    groupOrder: 20,
    order: 10,
    label: '字型',
    control: 'select',
    defaultValue: 'sans',
    options: [
      { id: 'sans', label: '無襯線' },
      { id: 'serif', label: '襯線' },
      { id: 'rounded', label: '圓體' },
      { id: 'ornate', label: '華麗明朝（Hina Mincho）' },
      { id: 'antique', label: '古典明朝（GenEi Antique）' },
    ],
  },
  {
    key: 'fontScale',
    group: 'typography',
    groupLabel: '文字',
    groupOrder: 20,
    order: 20,
    label: '字級',
    control: 'select',
    defaultValue: 'medium',
    options: [
      { id: 'small', label: '小' },
      { id: 'medium', label: '標準' },
      { id: 'large', label: '大' },
    ],
  },
  {
    key: 'fontWeight',
    group: 'typography',
    groupLabel: '文字',
    groupOrder: 20,
    order: 30,
    label: '字重',
    control: 'select',
    defaultValue: 'semibold',
    options: [
      { id: 'regular', label: '一般' },
      { id: 'semibold', label: '中粗' },
      { id: 'bold', label: '粗體' },
    ],
  },
  {
    key: 'contrastStyle',
    group: 'readability',
    groupLabel: '可讀性',
    groupOrder: 30,
    order: 10,
    label: '文字對比',
    control: 'select',
    defaultValue: 'balanced',
    options: [
      { id: 'clean', label: '無描邊' },
      { id: 'balanced', label: '標準描邊' },
      { id: 'strong-outline', label: '強描邊' },
    ],
  },
  {
    key: 'alignment',
    group: 'layout',
    groupLabel: '版面',
    groupOrder: 50,
    order: 10,
    label: '對齊',
    control: 'select',
    defaultValue: 'left',
    options: [
      { id: 'left', label: '靠左' },
      { id: 'center', label: '置中' },
      { id: 'right', label: '靠右' },
    ],
  },
  {
    key: 'surface',
    group: 'surface',
    groupLabel: '背景',
    groupOrder: 40,
    order: 10,
    label: '背景透明度',
    control: 'select',
    defaultValue: 'transparent',
    options: [
      { id: 'transparent', label: '透明' },
      { id: 'soft', label: '半透明' },
      { id: 'solid', label: '實底' },
    ],
  },
  {
    key: 'furigana',
    group: 'content',
    groupLabel: '內容顯示',
    groupOrder: 70,
    order: 10,
    label: '假名標音',
    control: 'select',
    defaultValue: 'auto',
    options: [
      { id: 'auto', label: '有資料時顯示' },
      { id: 'off', label: '關閉' },
    ],
  },
  {
    key: 'kineticMaterial',
    group: 'readability',
    groupLabel: '可讀性',
    groupOrder: 30,
    order: 20,
    label: '文字材質',
    control: 'select',
    defaultValue: 'candy-rim',
    options: [
      { id: 'solid-outline', label: '樣式 1｜單色黑框' },
      { id: 'candy-rim', label: '樣式 2｜漸層白框' },
      { id: 'chromatic-depth', label: '樣式 3｜右下錯位' },
      { id: 'cycle', label: '三款依句序切換' },
    ],
  },
  {
    key: 'kineticArrangement',
    group: 'layout',
    groupLabel: '版面',
    groupOrder: 50,
    order: 20,
    label: '文字排列',
    control: 'select',
    defaultValue: 'straight',
    options: [
      { id: 'straight', label: '端正' },
      { id: 'subtle-offset', label: '些微偏移' },
    ],
  },
  {
    key: 'textColor',
    group: 'color',
    groupLabel: '色彩',
    groupOrder: 10,
    order: 20,
    label: '文字顏色',
    control: 'color',
    defaultValue: '#fff8ec',
  },
  {
    key: 'accentColor',
    group: 'color',
    groupLabel: '色彩',
    groupOrder: 10,
    order: 30,
    label: '藝術墨影',
    control: 'color',
    defaultValue: '#ffffff',
  },
  {
    key: 'positionAnchor',
    group: 'layout',
    groupLabel: '版面',
    groupOrder: 50,
    order: 30,
    label: '顯示位置',
    control: 'select',
    defaultValue: 'center-right',
    options: [
      { id: 'top-left', label: '左上' },
      { id: 'top-center', label: '中上' },
      { id: 'top-right', label: '右上' },
      { id: 'center-left', label: '左中' },
      { id: 'center', label: '正中' },
      { id: 'center-right', label: '右中' },
      { id: 'bottom-left', label: '左下' },
      { id: 'bottom-center', label: '中下' },
      { id: 'bottom-right', label: '右下' },
    ],
  },
  {
    key: 'positionOffsetX',
    group: 'layout',
    groupLabel: '版面',
    groupOrder: 50,
    order: 40,
    label: '水平微調',
    control: 'range',
    defaultValue: 0,
    min: -12,
    max: 12,
    step: 1,
    unit: '%',
  },
  {
    key: 'positionOffsetY',
    group: 'layout',
    groupLabel: '版面',
    groupOrder: 50,
    order: 50,
    label: '垂直微調',
    control: 'range',
    defaultValue: 0,
    min: -25,
    max: 25,
    step: 1,
    unit: '%',
  },
  {
    key: 'spacingDensity',
    group: 'layout',
    groupLabel: '版面',
    groupOrder: 50,
    order: 60,
    label: '間距',
    control: 'select',
    defaultValue: 'normal',
    options: [
      { id: 'compact', label: '緊湊' },
      { id: 'normal', label: '標準' },
      { id: 'relaxed', label: '寬鬆' },
    ],
  },
  {
    key: 'contentWidth',
    group: 'layout',
    groupLabel: '版面',
    groupOrder: 50,
    order: 70,
    label: '內容寬度',
    control: 'select',
    defaultValue: 'standard',
    options: [
      { id: 'narrow', label: '窄' },
      { id: 'standard', label: '標準' },
      { id: 'wide', label: '寬' },
    ],
  },
];

const FIELD_MAP = new Map(FIELD_DEFINITIONS.map((field) => [field.key, field]));
const BASIC_APPEARANCE_KEYS = Object.freeze([
  'paletteId',
  'fontFamily',
  'fontScale',
  'fontWeight',
  'contrastStyle',
  'surface',
  'alignment',
  'spacingDensity',
  'contentWidth',
]);
const BASIC_FONT_IDS = Object.freeze(['sans', 'serif', 'rounded']);
const ORNATE_FONT_IDS = Object.freeze(['ornate', 'antique']);
const ORNATE_POSITION_IDS = Object.freeze([
  'top-right',
  'center-right',
  'bottom-right',
]);

const NOW_PLAYING_FIELD_DEFAULTS = Object.freeze({
  fontFamily: { defaultValue: 'sans' },
  fontScale: { defaultValue: 'medium' },
  fontWeight: { defaultValue: 'bold' },
  alignment: { defaultValue: 'left' },
  surface: { defaultValue: 'solid' },
});
const SETLIST_FIELD_DEFAULTS = Object.freeze({
  fontFamily: { defaultValue: 'sans' },
  fontScale: { defaultValue: 'medium' },
  fontWeight: { defaultValue: 'semibold' },
  alignment: { defaultValue: 'left' },
  surface: { defaultValue: 'solid' },
});
const LYRICS_FIELD_DEFAULTS = Object.freeze({
  fontFamily: { defaultValue: 'serif' },
  fontScale: { defaultValue: 'medium' },
  fontWeight: { defaultValue: 'bold' },
  alignment: { defaultValue: 'left' },
  surface: { defaultValue: 'transparent' },
});

const TEMPLATE_CONFIGS = Object.freeze({
  'now-next': {
    keys: [
      'paletteId',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'surface',
      'alignment',
      'spacingDensity',
    ],
    fields: NOW_PLAYING_FIELD_DEFAULTS,
  },
  'art-card': {
    keys: ['paletteId', 'fontFamily', 'fontScale', 'fontWeight'],
    fields: NOW_PLAYING_FIELD_DEFAULTS,
  },
  'cover-player': {
    keys: ['paletteId', 'fontScale', 'fontWeight', 'surface'],
    fields: NOW_PLAYING_FIELD_DEFAULTS,
  },
  'queue-board': {
    keys: [
      'paletteId',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'surface',
      'spacingDensity',
    ],
    fields: SETLIST_FIELD_DEFAULTS,
  },
  'quiet-caption': {
    keys: BASIC_APPEARANCE_KEYS,
    fields: LYRICS_FIELD_DEFAULTS,
  },
  'focus-line': {
    keys: BASIC_APPEARANCE_KEYS,
    fields: LYRICS_FIELD_DEFAULTS,
  },
  'karaoke-stack': {
    keys: ['paletteId', 'fontScale'],
  },
  'kinetic-pop': {
    keys: ['paletteId', 'fontScale', 'kineticMaterial', 'kineticArrangement'],
  },
  'ornate-vertical': {
    keys: [
      'paletteId',
      'textColor',
      'accentColor',
      'fontFamily',
      'fontScale',
      'positionAnchor',
      'positionOffsetX',
      'positionOffsetY',
    ],
    fields: {
      fontFamily: { defaultValue: 'ornate', optionIds: ORNATE_FONT_IDS },
      positionAnchor: {
        defaultValue: 'center-right',
        optionIds: ORNATE_POSITION_IDS,
      },
    },
  },
  'manga-frame': {
    keys: ['paletteId', 'fontFamily', 'fontScale', 'fontWeight', 'furigana'],
    fields: {
      fontFamily: { defaultValue: 'serif' },
      fontScale: { defaultValue: 'medium' },
      fontWeight: { defaultValue: 'bold' },
      furigana: { defaultValue: 'auto' },
    },
  },
  'live-stage': {
    keys: ['paletteId', 'fontFamily', 'fontScale', 'contrastStyle'],
    fields: {
      fontFamily: { defaultValue: 'serif' },
      fontScale: { defaultValue: 'medium' },
    },
  },
  'reading-aid': {
    keys: [],
  },
});

function templateConfig(templateId) {
  return (
    TEMPLATE_CONFIGS[String(templateId ?? '')] ?? {
      keys: BASIC_APPEARANCE_KEYS,
    }
  );
}

function cloneField(field, override = {}) {
  const { optionIds, ...fieldOverride } = override;
  const options = Array.isArray(field.options)
    ? field.options
        .filter((option) => !optionIds || optionIds.includes(option.id))
        .map((option) => ({ ...option }))
    : undefined;
  return {
    ...field,
    ...fieldOverride,
    ...(options ? { options } : {}),
  };
}

function sanitizedRangeValue(field, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const clamped = Math.min(field.max, Math.max(field.min, value));
  const steps = Math.round((clamped - field.min) / field.step);
  return Number((field.min + steps * field.step).toFixed(6));
}

export const OUTPUT_APPEARANCE_FIELDS = Object.freeze(
  FIELD_DEFINITIONS.map((field) => Object.freeze(cloneField(field))),
);

export const OUTPUT_APPEARANCE_DEFAULTS = Object.freeze(
  Object.fromEntries(
    FIELD_DEFINITIONS.map((field) => [field.key, field.defaultValue]),
  ),
);

export const OUTPUT_SLOT_APPEARANCE_DEFAULTS = Object.freeze({
  'now-playing': Object.freeze({
    paletteId: 'original',
    fontFamily: 'sans',
    fontScale: 'medium',
    fontWeight: 'bold',
    alignment: 'left',
    surface: 'solid',
    furigana: 'auto',
    kineticMaterial: 'candy-rim',
    kineticArrangement: 'straight',
    contrastStyle: 'balanced',
    spacingDensity: 'normal',
    contentWidth: 'standard',
  }),
  setlist: Object.freeze({
    paletteId: 'original',
    fontFamily: 'sans',
    fontScale: 'medium',
    fontWeight: 'semibold',
    alignment: 'left',
    surface: 'solid',
    furigana: 'auto',
    kineticMaterial: 'candy-rim',
    kineticArrangement: 'straight',
    contrastStyle: 'balanced',
    spacingDensity: 'normal',
    contentWidth: 'standard',
  }),
  lyrics: Object.freeze({
    paletteId: 'original',
    fontFamily: 'serif',
    fontScale: 'medium',
    fontWeight: 'bold',
    alignment: 'left',
    surface: 'transparent',
    furigana: 'auto',
    kineticMaterial: 'candy-rim',
    kineticArrangement: 'straight',
    contrastStyle: 'balanced',
    spacingDensity: 'normal',
    contentWidth: 'standard',
  }),
});

export function sanitizeOutputAppearanceSetting(key, value) {
  const field = FIELD_MAP.get(key);
  if (!field) return undefined;
  if (field.control === 'select') {
    return field.options.some((option) => option.id === value)
      ? value
      : undefined;
  }
  if (field.control === 'color') {
    return typeof value === 'string' && COLOR_RE.test(value)
      ? value.toLowerCase()
      : undefined;
  }
  if (field.control === 'range') return sanitizedRangeValue(field, value);
  return undefined;
}

export function outputAppearanceFieldsForTemplate(templateId) {
  const config = templateConfig(templateId);
  return config.keys.map((key) => {
    const field = FIELD_MAP.get(key);
    const templateOverride = config.fields?.[key] ?? {};
    const fontOverride =
      key === 'fontFamily' && !templateOverride.optionIds
        ? { optionIds: BASIC_FONT_IDS }
        : {};
    return cloneField(field, { ...fontOverride, ...templateOverride });
  });
}

export function outputAppearanceFieldKeysForTemplate(templateId) {
  return outputAppearanceFieldsForTemplate(templateId).map(({ key }) => key);
}

export function normalizeOutputAppearance(settings = {}, options = {}) {
  const normalized = {};
  const templateId = String(options.templateId ?? '');
  const compatibleFields = new Map(
    (templateId
      ? outputAppearanceFieldsForTemplate(templateId)
      : OUTPUT_APPEARANCE_FIELDS
    ).map((field) => [field.key, field]),
  );

  for (const baseField of FIELD_DEFINITIONS) {
    const compatibleField = compatibleFields.get(baseField.key);
    const field = compatibleField ?? baseField;
    const sanitized = compatibleField
      ? sanitizeOutputAppearanceSetting(
          baseField.key,
          settings?.[baseField.key],
        )
      : undefined;
    if (
      sanitized !== undefined &&
      (!field.options ||
        field.options.some((option) => option.id === sanitized))
    ) {
      normalized[baseField.key] = sanitized;
    } else {
      normalized[baseField.key] = field.defaultValue;
    }
  }

  return normalized;
}

export function outputAppearanceOptionIds() {
  return Object.fromEntries(
    FIELD_DEFINITIONS.filter((field) => Array.isArray(field.options)).map(
      (field) => [field.key, field.options.map((option) => option.id)],
    ),
  );
}
