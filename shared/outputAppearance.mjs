import { OUTPUT_TEMPLATE_ELEMENTS } from './outputTemplateElements.mjs';

export const OUTPUT_APPEARANCE_SCHEMA_VERSION = 7;

export const OUTPUT_APPEARANCE_GROUPS = Object.freeze([
  Object.freeze({ id: 'color-treatment', label: '色彩處理', order: 10 }),
  Object.freeze({ id: 'custom-color', label: '自訂色彩', order: 20 }),
  Object.freeze({ id: 'typography', label: '文字', order: 30 }),
  Object.freeze({ id: 'readability', label: '可讀性', order: 40 }),
  Object.freeze({ id: 'surface', label: '背景', order: 50 }),
  Object.freeze({ id: 'layout', label: '版面', order: 60 }),
  Object.freeze({ id: 'motion', label: '動態', order: 70 }),
  Object.freeze({ id: 'content', label: '內容顯示', order: 80 }),
]);

// Property families and tiers from ADR 0027; `group` stays the Inspector grouping.
export const OUTPUT_PROPERTY_FAMILIES = Object.freeze([
  'document',
  'swatch',
  'character',
  'legibility',
  'fill',
  'layout',
  'stacking',
  'visibility',
  'motion',
  'asset',
]);
export const OUTPUT_PROPERTY_TIERS = Object.freeze(['basic', 'advanced']);

const COLOR_RE = /^#[0-9a-f]{6}$/iu;
const MAX_LOCAL_FONT_NAME_LENGTH = 160;
const UNSAFE_LOCAL_FONT_NAME_RE = /[\\/;{}<>]|(?:url|var)\s*\(/iu;
const GROUP_MAP = new Map(
  OUTPUT_APPEARANCE_GROUPS.map((group) => [group.id, group]),
);

function fieldDefinition(groupId, definition) {
  const group = GROUP_MAP.get(groupId);
  if (!group) throw new Error(`Unknown output appearance group: ${groupId}`);
  if (!OUTPUT_PROPERTY_FAMILIES.includes(definition.family)) {
    throw new Error(`Unknown output property family: ${definition.family}`);
  }
  if (!OUTPUT_PROPERTY_TIERS.includes(definition.tier)) {
    throw new Error(`Unknown output property tier: ${definition.tier}`);
  }
  if (typeof definition.reflow !== 'boolean') {
    throw new Error(`Missing output property reflow: ${definition.key}`);
  }
  return {
    scope: 'template',
    ...definition,
    group: group.id,
    groupLabel: group.label,
    groupOrder: group.order,
  };
}

const FIELD_DEFINITIONS = [
  fieldDefinition('layout', {
    key: 'receiptDirection',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 80,
    label: '出紙方向',
    control: 'select',
    defaultValue: 'down',
    options: [
      { id: 'down', label: '向下出紙' },
      { id: 'up', label: '向上出紙' },
    ],
  }),
  fieldDefinition('motion', {
    key: 'receiptReview',
    family: 'motion',
    tier: 'basic',
    reflow: false,
    order: 10,
    label: '定時回顧歷史',
    control: 'select',
    defaultValue: 'on',
    options: [
      { id: 'on', label: '開啟' },
      { id: 'off', label: '關閉' },
    ],
  }),
  fieldDefinition('motion', {
    key: 'receiptReviewInterval',
    family: 'motion',
    tier: 'basic',
    reflow: false,
    order: 20,
    label: '回顧間隔',
    control: 'range',
    defaultValue: 15,
    min: 5,
    max: 60,
    step: 5,
    unit: ' 秒',
  }),
  fieldDefinition('color-treatment', {
    key: 'paletteId',
    family: 'document',
    tier: 'basic',
    reflow: false,
    order: 10,
    label: '配色風格',
    control: 'select',
    editor: 'look',
    defaultValue: 'original',
    options: [
      { id: 'original', label: '模板原色' },
      { id: 'warm', label: '暖色舞台' },
      { id: 'cool', label: '冷色舞台' },
      { id: 'monochrome', label: '黑白' },
      { id: 'high-contrast', label: '高對比' },
    ],
  }),
  fieldDefinition('color-treatment', {
    key: 'lookAmount',
    family: 'document',
    tier: 'basic',
    reflow: false,
    order: 20,
    label: '強度',
    control: 'range',
    defaultValue: 100,
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
  }),
  fieldDefinition('typography', {
    key: 'fontFamily',
    family: 'character',
    tier: 'basic',
    reflow: true,
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
  }),
  fieldDefinition('typography', {
    key: 'fontScale',
    family: 'document',
    tier: 'basic',
    reflow: true,
    order: 20,
    label: '字級',
    control: 'select',
    editor: 'font-scale',
    defaultValue: 'medium',
    options: [
      { id: 'small', label: '小' },
      { id: 'medium', label: '標準' },
      { id: 'large', label: '大' },
    ],
  }),
  fieldDefinition('typography', {
    key: 'fontWeight',
    family: 'character',
    tier: 'basic',
    reflow: true,
    order: 30,
    label: '字重',
    control: 'select',
    defaultValue: 'semibold',
    options: [
      { id: 'regular', label: '一般' },
      { id: 'semibold', label: '中粗' },
      { id: 'bold', label: '粗體' },
    ],
  }),
  fieldDefinition('readability', {
    key: 'contrastStyle',
    family: 'legibility',
    tier: 'basic',
    reflow: false,
    order: 10,
    label: '文字對比',
    control: 'select',
    defaultValue: 'balanced',
    options: [
      { id: 'clean', label: '無描邊' },
      { id: 'balanced', label: '標準描邊' },
      { id: 'strong-outline', label: '強描邊' },
    ],
  }),
  fieldDefinition('layout', {
    key: 'alignment',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 10,
    label: '對齊',
    control: 'select',
    editor: 'alignment',
    defaultValue: 'left',
    options: [
      { id: 'left', label: '靠左' },
      { id: 'center', label: '置中' },
      { id: 'right', label: '靠右' },
    ],
  }),
  fieldDefinition('surface', {
    key: 'surface',
    family: 'fill',
    tier: 'basic',
    reflow: false,
    order: 10,
    label: '背景透明度',
    control: 'select',
    defaultValue: 'transparent',
    options: [
      { id: 'transparent', label: '透明' },
      { id: 'soft', label: '半透明' },
      { id: 'solid', label: '實底' },
    ],
  }),
  fieldDefinition('content', {
    key: 'furigana',
    family: 'document',
    tier: 'basic',
    reflow: true,
    order: 10,
    label: '假名標音',
    control: 'select',
    defaultValue: 'auto',
    options: [
      { id: 'auto', label: '有資料時顯示' },
      { id: 'off', label: '關閉' },
    ],
  }),
  fieldDefinition('readability', {
    key: 'kineticMaterial',
    family: 'legibility',
    tier: 'basic',
    reflow: false,
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
  }),
  fieldDefinition('layout', {
    key: 'kineticArrangement',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 20,
    label: '文字排列',
    control: 'select',
    defaultValue: 'straight',
    options: [
      { id: 'straight', label: '端正' },
      { id: 'subtle-offset', label: '些微偏移' },
    ],
  }),
  fieldDefinition('custom-color', {
    key: 'textColor',
    family: 'swatch',
    tier: 'advanced',
    reflow: false,
    order: 10,
    label: '文字色',
    control: 'color',
    defaultValue: '#fff8ec',
  }),
  fieldDefinition('custom-color', {
    key: 'accentColor',
    family: 'swatch',
    tier: 'advanced',
    reflow: false,
    order: 20,
    label: '藝術墨影',
    control: 'color',
    defaultValue: '#ffffff',
  }),
  fieldDefinition('layout', {
    key: 'positionAnchor',
    family: 'layout',
    tier: 'basic',
    reflow: false,
    order: 30,
    label: '顯示位置',
    control: 'select',
    editor: 'position-grid',
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
  }),
  fieldDefinition('layout', {
    key: 'positionOffsetX',
    family: 'layout',
    tier: 'advanced',
    reflow: false,
    order: 40,
    label: '水平微調',
    control: 'range',
    signed: true,
    defaultValue: 0,
    min: -12,
    max: 12,
    step: 1,
    unit: '%',
  }),
  fieldDefinition('layout', {
    key: 'positionOffsetY',
    family: 'layout',
    tier: 'advanced',
    reflow: false,
    order: 50,
    label: '垂直微調',
    control: 'range',
    signed: true,
    defaultValue: 0,
    min: -25,
    max: 25,
    step: 1,
    unit: '%',
  }),
  fieldDefinition('layout', {
    key: 'spacingDensity',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 60,
    label: '間距',
    control: 'select',
    defaultValue: 'normal',
    options: [
      { id: 'compact', label: '緊湊' },
      { id: 'normal', label: '標準' },
      { id: 'relaxed', label: '寬鬆' },
    ],
  }),
  fieldDefinition('layout', {
    key: 'contentWidth',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 70,
    label: '內容寬度',
    control: 'select',
    defaultValue: 'standard',
    options: [
      { id: 'narrow', label: '窄' },
      { id: 'standard', label: '標準' },
      { id: 'wide', label: '寬' },
    ],
  }),
];

const FIELD_MAP = new Map(FIELD_DEFINITIONS.map((field) => [field.key, field]));

const ELEMENT_FONT_WEIGHTS = Object.freeze({
  regular: 400,
  semibold: 600,
  bold: 700,
});

const ELEMENT_PROPERTY_DEFINITIONS = Object.freeze(
  new Map(
    [
      fieldDefinition('typography', {
        key: 'fontWeight',
        family: 'character',
        tier: 'basic',
        reflow: true,
        scope: 'element',
        order: 10,
        label: '字重',
        control: 'select',
        defaultValue: 'inherit',
        options: [
          { id: 'inherit', label: '跟隨模板' },
          { id: 'regular', label: '一般' },
          { id: 'semibold', label: '中粗' },
          { id: 'bold', label: '粗體' },
        ],
      }),
      fieldDefinition('typography', {
        key: 'fontSizeScale',
        family: 'character',
        tier: 'basic',
        reflow: true,
        scope: 'element',
        order: 20,
        label: '字級',
        control: 'range',
        defaultValue: 100,
        min: 80,
        max: 125,
        step: 5,
        unit: '%',
      }),
      fieldDefinition('content', {
        key: 'visible',
        family: 'visibility',
        tier: 'basic',
        reflow: true,
        scope: 'element',
        order: 10,
        label: '顯示',
        control: 'select',
        defaultValue: 'shown',
        options: [
          { id: 'shown', label: '顯示' },
          { id: 'hidden', label: '隱藏' },
        ],
      }),
    ].map((definition) => [definition.key, definition]),
  ),
);

const ELEMENT_SETTING_KEY_RE = /^element.([a-z][a-z0-9-]*).([A-Za-z]+)$/u;
const BASIC_APPEARANCE_KEYS = Object.freeze([
  'paletteId',
  'lookAmount',
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
const MANGA_FONT_IDS = Object.freeze(['antique', ...BASIC_FONT_IDS]);
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
  'receipt-setlist': {
    keys: [
      'fontScale',
      'receiptDirection',
      'receiptReview',
      'receiptReviewInterval',
    ],
    fields: { fontScale: { defaultValue: 'medium' } },
  },
  'art-card': {
    keys: ['paletteId', 'lookAmount', 'fontFamily', 'fontScale', 'fontWeight'],
    fields: NOW_PLAYING_FIELD_DEFAULTS,
  },
  'cover-player': {
    keys: ['paletteId', 'lookAmount', 'fontScale', 'fontWeight', 'surface'],
    fields: NOW_PLAYING_FIELD_DEFAULTS,
  },
  'queue-board': {
    keys: [
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'surface',
      'spacingDensity',
    ],
    fields: SETLIST_FIELD_DEFAULTS,
  },
  'focus-line': {
    keys: BASIC_APPEARANCE_KEYS,
    fields: LYRICS_FIELD_DEFAULTS,
  },
  'karaoke-stack': {
    keys: ['paletteId', 'lookAmount', 'fontScale'],
  },
  'kinetic-pop': {
    keys: [
      'paletteId',
      'lookAmount',
      'fontScale',
      'kineticMaterial',
      'kineticArrangement',
    ],
  },
  'ornate-vertical': {
    keys: [
      'paletteId',
      'lookAmount',
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
    keys: [
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'fontWeight',
      'furigana',
    ],
    fields: {
      fontFamily: { defaultValue: 'antique', optionIds: MANGA_FONT_IDS },
      fontScale: { defaultValue: 'medium' },
      fontWeight: { defaultValue: 'bold' },
      furigana: { defaultValue: 'auto' },
    },
  },
  'live-stage': {
    keys: [
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'contrastStyle',
    ],
    fields: {
      fontFamily: {
        defaultValue: 'sans',
        editor: 'font-family',
        allowLocalFonts: true,
      },
      fontScale: { defaultValue: 'medium' },
    },
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

function sanitizedLocalFontName(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().normalize('NFC');
  const hasControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (
    !normalized ||
    normalized.length > MAX_LOCAL_FONT_NAME_LENGTH ||
    hasControlCharacter ||
    UNSAFE_LOCAL_FONT_NAME_RE.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

export function sanitizeOutputLocalFont(value) {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    value.source !== 'local'
  ) {
    return undefined;
  }
  const family = sanitizedLocalFontName(value.family);
  const postscriptName = sanitizedLocalFontName(value.postscriptName);
  const style = sanitizedLocalFontName(value.style ?? 'Regular');
  if (!family || !postscriptName || !style) return undefined;
  return { source: 'local', family, postscriptName, style };
}

export function isOutputLocalFont(value) {
  return sanitizeOutputLocalFont(value) !== undefined;
}

export function outputLocalFontCssValue(value) {
  const normalized = sanitizeOutputLocalFont(value);
  return normalized ? JSON.stringify(normalized.family) : undefined;
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
    lookAmount: 100,
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
    lookAmount: 100,
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
    lookAmount: 100,
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

export function sanitizeOutputAppearanceSetting(key, value, options = {}) {
  if (isOutputElementSettingKey(key)) {
    return sanitizeElementSetting(key, value, options.templateId);
  }
  const baseField = FIELD_MAP.get(key);
  if (!baseField) return undefined;
  let sanitized;
  if (baseField.control === 'select') {
    if (key === 'fontFamily') {
      const localFont = sanitizeOutputLocalFont(value);
      if (localFont) sanitized = localFont;
    }
    sanitized ??= baseField.options.some((option) => option.id === value)
      ? value
      : undefined;
  } else if (baseField.control === 'color') {
    sanitized =
      typeof value === 'string' && COLOR_RE.test(value)
        ? value.toLowerCase()
        : undefined;
  } else if (baseField.control === 'range') {
    sanitized = sanitizedRangeValue(baseField, value);
  }

  if (
    sanitized === undefined ||
    !options.templateId ||
    !isOutputLocalFont(sanitized)
  ) {
    return sanitized;
  }
  const field = outputAppearanceFieldsForTemplate(options.templateId).find(
    (candidate) => candidate.key === key,
  );
  if (!field) return undefined;
  return field.allowLocalFonts === true ? sanitized : undefined;
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

function sameSettingValue(left, right) {
  if (left === right) return true;
  return (
    typeof left === 'object' &&
    left !== null &&
    typeof right === 'object' &&
    right !== null &&
    JSON.stringify(left) === JSON.stringify(right)
  );
}

// Switching templates keeps customized values. A value still equal to the
// previous template's default (or the slot default when that template had no
// such field) was never customized, so it follows the next template's default.
export function carryOutputAppearanceToTemplate(settings, options = {}) {
  const { fromTemplateId, toTemplateId, slotDefaults = {} } = options;
  if (!settings || fromTemplateId === toTemplateId) return { ...settings };
  const fromDefaults = new Map(
    outputAppearanceFieldsForTemplate(fromTemplateId).map((field) => [
      field.key,
      field.defaultValue,
    ]),
  );
  const next = { ...settings };
  for (const field of outputAppearanceFieldsForTemplate(toTemplateId)) {
    if (!(field.key in settings)) continue;
    const reference = fromDefaults.has(field.key)
      ? fromDefaults.get(field.key)
      : slotDefaults[field.key];
    if (sameSettingValue(settings[field.key], reference)) {
      next[field.key] = field.defaultValue;
    }
  }
  const targetElementKeys = new Set(
    outputElementFieldsForTemplate(toTemplateId).map(({ key }) => key),
  );
  for (const key of Object.keys(next)) {
    if (isOutputElementSettingKey(key) && !targetElementKeys.has(key)) {
      delete next[key];
    }
  }
  return next;
}

export function isOutputElementSettingKey(key) {
  return typeof key === 'string' && ELEMENT_SETTING_KEY_RE.test(key);
}

export function outputElementTargetsForTemplate(templateId) {
  const elements = OUTPUT_TEMPLATE_ELEMENTS[String(templateId ?? '')] ?? [];
  return elements.map((element) => ({
    id: element.id,
    kind: element.kind,
    label: element.label,
    fields: element.properties.map((propertyKey) =>
      cloneField(ELEMENT_PROPERTY_DEFINITIONS.get(propertyKey), {
        key: `element.${element.id}.${propertyKey}`,
        propertyKey,
        elementId: element.id,
      }),
    ),
  }));
}

export function outputElementFieldsForTemplate(templateId) {
  return outputElementTargetsForTemplate(templateId).flatMap(
    ({ fields }) => fields,
  );
}

function sanitizeElementSetting(key, value, templateId) {
  const field = outputElementFieldsForTemplate(templateId).find(
    (candidate) => candidate.key === key,
  );
  if (!field) return undefined;
  if (field.control === 'range') return sanitizedRangeValue(field, value);
  return field.options.some((option) => option.id === value)
    ? value
    : undefined;
}

export function normalizeOutputElementAppearance(settings = {}, options = {}) {
  return Object.fromEntries(
    outputElementFieldsForTemplate(options.templateId).map((field) => [
      field.key,
      sanitizeElementSetting(
        field.key,
        settings?.[field.key],
        options.templateId,
      ) ?? field.defaultValue,
    ]),
  );
}

export function outputElementFontWeight(value) {
  return ELEMENT_FONT_WEIGHTS[value];
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
          templateId ? { templateId } : undefined,
        )
      : undefined;
    const allowsSanitizedValue = isOutputLocalFont(sanitized)
      ? true
      : !field.options ||
        field.options.some((option) => option.id === sanitized);
    if (sanitized !== undefined && allowsSanitizedValue) {
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
