import { OUTPUT_TEMPLATE_ELEMENTS } from './outputTemplateElements.mjs';
import {
  DEFAULT_MANGA_FRAME_ID,
  MANGA_BUBBLE_STYLE_IDS,
} from './presentation/mangaFrameContract.mjs';

export const OUTPUT_APPEARANCE_SCHEMA_VERSION = 20;

export const OUTPUT_TRANSLATION_FONT_SCALE = Object.freeze({
  min: 75,
  max: 150,
  step: 5,
  defaultValue: 100,
});

// A Look owns semantic color targets and optional artwork grading.
function filmColors({
  ink,
  paper,
  muted,
  accent,
  echo,
  blue,
  rose,
  green,
  amber,
}) {
  const tint = (color, amount) =>
    `color-mix(in srgb, ${color} ${amount}%, transparent)`;
  return {
    ink,
    paper,
    'text-primary': paper,
    'text-secondary': muted,
    current: accent,
    surface: tint(ink, 94),
    'surface-soft': tint(ink, 72),
    outline: tint(paper, 38),
    divider: tint(paper, 25),
    'current-surface': tint(accent, 22),
    'mark-surface': tint(paper, 14),
    'stroke-strong': ink,
    'stroke-soft': tint(ink, 84),
    'ktv-fill-unsung': paper,
    'ktv-fill-solo': accent,
    'ktv-fill-male': blue,
    'ktv-fill-female': rose,
    'ktv-fill-group': green,
    'ktv-stroke-unsung': ink,
    'ktv-stroke-sung': paper,
    'kinetic-ink': ink,
    'kinetic-paper': paper,
    'kinetic-yellow': amber,
    'kinetic-red': rose,
    'kinetic-ochre': echo,
    'kinetic-cyan': blue,
    'kinetic-magenta': rose,
    'kinetic-candy-deep': echo,
    'kinetic-candy-light': accent,
    'ornate-paper': paper,
    'ornate-echo': echo,
  };
}

export const OUTPUT_LOOK_PRESETS = Object.freeze({
  original: {},
  warm: {
    colors: {
      ink: '#211711',
      paper: '#fff4df',
      'text-primary': '#fff4df',
      'text-secondary': '#e7caa8',
      current: '#ff8b68',
      surface: 'rgb(33 23 17 / 94%)',
      'surface-soft': 'rgb(33 23 17 / 72%)',
      outline: 'rgb(255 244 223 / 38%)',
      divider: 'rgb(255 244 223 / 24%)',
      'current-surface': 'rgb(255 139 104 / 22%)',
      'mark-surface': 'rgb(255 244 223 / 14%)',
      'stroke-strong': '#211711',
      'stroke-soft': 'rgb(33 23 17 / 82%)',
      'ktv-fill-unsung': '#fff4df',
      'ktv-fill-solo': '#ffba63',
      'ktv-fill-male': '#74c9ff',
      'ktv-fill-female': '#ff99b8',
      'ktv-fill-group': '#97e0aa',
      'ktv-stroke-unsung': '#211711',
      'ktv-stroke-sung': '#fff4df',
      'kinetic-ink': '#211711',
      'kinetic-paper': '#fff4df',
      'kinetic-yellow': '#ffc85a',
      'kinetic-red': '#ff725c',
      'kinetic-ochre': '#b86f2e',
      'kinetic-cyan': '#69d8df',
      'kinetic-magenta': '#ef7ca8',
      'kinetic-candy-deep': '#ff765f',
      'kinetic-candy-light': '#ffd37a',
      'ornate-paper': '#fff4df',
      'ornate-echo': '#c79f7e',
    },
  },
  cool: {
    colors: {
      ink: '#0c1821',
      paper: '#eef9ff',
      'text-primary': '#eef9ff',
      'text-secondary': '#bdd9e8',
      current: '#66d8e8',
      surface: 'rgb(12 24 33 / 94%)',
      'surface-soft': 'rgb(12 24 33 / 72%)',
      outline: 'rgb(238 249 255 / 38%)',
      divider: 'rgb(238 249 255 / 24%)',
      'current-surface': 'rgb(102 216 232 / 22%)',
      'mark-surface': 'rgb(238 249 255 / 14%)',
      'stroke-strong': '#0c1821',
      'stroke-soft': 'rgb(12 24 33 / 82%)',
      'ktv-fill-unsung': '#eef9ff',
      'ktv-fill-solo': '#76e4ee',
      'ktv-fill-male': '#70aaff',
      'ktv-fill-female': '#e293ff',
      'ktv-fill-group': '#75e2b3',
      'ktv-stroke-unsung': '#0c1821',
      'ktv-stroke-sung': '#eef9ff',
      'kinetic-ink': '#0c1821',
      'kinetic-paper': '#eef9ff',
      'kinetic-yellow': '#82e8f2',
      'kinetic-red': '#8a9eff',
      'kinetic-ochre': '#4c84b9',
      'kinetic-cyan': '#66d8e8',
      'kinetic-magenta': '#c18cf0',
      'kinetic-candy-deep': '#608de8',
      'kinetic-candy-light': '#8ce9ed',
      'ornate-paper': '#eef9ff',
      'ornate-echo': '#8bb8ce',
    },
  },
  'warm-film': {
    section: 'film',
    grain: { amount: 48, size: 'medium' },
    colors: filmColors({
      ink: '#302520',
      paper: '#f3e3c7',
      muted: '#c9b59e',
      accent: '#dca370',
      echo: '#bb8c6b',
      blue: '#9fb5bb',
      rose: '#d499a1',
      green: '#a7b897',
      amber: '#e0bc7f',
    }),
    artwork: { saturation: 0.8, contrast: 1.03, gain: [1.06, 1.01, 0.89] },
  },
  'cool-film': {
    section: 'film',
    grain: { amount: 28, size: 'fine' },
    colors: filmColors({
      ink: '#252e37',
      paper: '#e4ebea',
      muted: '#b4c7d0',
      accent: '#9ac9ca',
      echo: '#80a7b3',
      blue: '#97b8dc',
      rose: '#c4a4bb',
      green: '#a0c3b5',
      amber: '#c7c5a3',
    }),
    artwork: { saturation: 0.72, contrast: 0.91, gain: [0.96, 1, 1.03] },
  },
  'velvia-style': {
    section: 'film',
    grain: { amount: 24, size: 'fine' },
    colors: filmColors({
      ink: '#191427',
      paper: '#fff5fa',
      muted: '#dcc5e7',
      accent: '#ff7dac',
      echo: '#c891e3',
      blue: '#76cfff',
      rose: '#ff8497',
      green: '#9bdf80',
      amber: '#ffd36d',
    }),
    artwork: { saturation: 1.24, contrast: 1.1, gain: [1, 1, 1] },
  },
  'kodak-gold-200-style': {
    section: 'film',
    grain: { amount: 55, size: 'medium' },
    colors: filmColors({
      ink: '#2c1c15',
      paper: '#fff2d6',
      muted: '#e7c79c',
      accent: '#ffb459',
      echo: '#c89058',
      blue: '#80c5e6',
      rose: '#f79a86',
      green: '#a9ce79',
      amber: '#ffd466',
    }),
    artwork: { saturation: 1.13, contrast: 1.04, gain: [1.08, 1.02, 0.91] },
  },
  'polaroid-600-style': {
    section: 'film',
    grain: { amount: 64, size: 'coarse' },
    colors: filmColors({
      ink: '#343038',
      paper: '#fff8ef',
      muted: '#d8c8c8',
      accent: '#eeb5b2',
      echo: '#aa8b9b',
      blue: '#9dc7d0',
      rose: '#dfa2aa',
      green: '#acc9ae',
      amber: '#eed19f',
    }),
    artwork: { saturation: 0.84, contrast: 0.85, gain: [1.04, 0.99, 1.01] },
  },
  monochrome: {
    colors: {
      ink: '#0d0d0f',
      paper: '#fafafa',
      'text-primary': '#fafafa',
      'text-secondary': '#d0d0d4',
      current: '#b8b8be',
      surface: 'rgb(13 13 15 / 94%)',
      'surface-soft': 'rgb(13 13 15 / 72%)',
      outline: 'rgb(250 250 250 / 40%)',
      divider: 'rgb(250 250 250 / 25%)',
      'current-surface': 'rgb(250 250 250 / 18%)',
      'mark-surface': 'rgb(250 250 250 / 13%)',
      'stroke-strong': '#0d0d0f',
      'stroke-soft': 'rgb(13 13 15 / 84%)',
      'ktv-fill-unsung': '#fafafa',
      'ktv-fill-solo': '#b8b8be',
      'ktv-fill-male': '#d8d8dc',
      'ktv-fill-female': '#a8a8ae',
      'ktv-fill-group': '#c4c4c9',
      'ktv-stroke-unsung': '#0d0d0f',
      'ktv-stroke-sung': '#fafafa',
      'kinetic-ink': '#0d0d0f',
      'kinetic-paper': '#fafafa',
      'kinetic-yellow': '#d8d8dc',
      'kinetic-red': '#a4a4aa',
      'kinetic-ochre': '#7d7d84',
      'kinetic-cyan': '#c8c8cd',
      'kinetic-magenta': '#9999a0',
      'kinetic-candy-deep': '#8c8c93',
      'kinetic-candy-light': '#dedee1',
      'ornate-paper': '#fafafa',
      'ornate-echo': '#9d9da3',
    },
    artwork: { saturation: 0, contrast: 1, gain: [1, 1, 1] },
  },
  'high-contrast': {
    colors: {
      ink: '#000000',
      paper: '#ffffff',
      'text-primary': '#ffffff',
      'text-secondary': '#ffffff',
      current: '#ffe100',
      surface: '#000000',
      'surface-soft': 'rgb(0 0 0 / 88%)',
      outline: '#ffffff',
      divider: 'rgb(255 255 255 / 58%)',
      'current-surface': 'rgb(255 225 0 / 28%)',
      'mark-surface': 'rgb(255 255 255 / 20%)',
      'stroke-strong': '#000000',
      'stroke-soft': '#000000',
      'ktv-fill-unsung': '#ffffff',
      'ktv-fill-solo': '#ffe100',
      'ktv-fill-male': '#00d8ff',
      'ktv-fill-female': '#ff70d0',
      'ktv-fill-group': '#9cff57',
      'ktv-stroke-unsung': '#000000',
      'ktv-stroke-sung': '#000000',
      'kinetic-ink': '#000000',
      'kinetic-paper': '#ffffff',
      'kinetic-yellow': '#ffe100',
      'kinetic-red': '#ff6159',
      'kinetic-ochre': '#ff9d00',
      'kinetic-cyan': '#00d8ff',
      'kinetic-magenta': '#ff70d0',
      'kinetic-candy-deep': '#ff6159',
      'kinetic-candy-light': '#ffe100',
      'ornate-paper': '#ffffff',
      'ornate-echo': '#ffe100',
    },
  },
});

const COMPOSITION_ONLY_GRADES = Object.freeze({
  warm: { saturation: 1, contrast: 1, gain: [1.04, 0.98, 0.89] },
  cool: { saturation: 0.95, contrast: 1, gain: [0.88, 0.98, 1.05] },
  'high-contrast': { saturation: 1.08, contrast: 1.24, gain: [1, 1, 1] },
});

// The alpha row stays the identity for artwork and template content.
export function outputArtworkGradeMatrix(
  presetId,
  strength,
  { composition = false } = {},
) {
  const artwork = Object.hasOwn(OUTPUT_LOOK_PRESETS, presetId)
    ? OUTPUT_LOOK_PRESETS[presetId].artwork
    : undefined;
  const grade =
    artwork ??
    (composition && Object.hasOwn(COMPOSITION_ONLY_GRADES, presetId)
      ? COMPOSITION_ONLY_GRADES[presetId]
      : undefined);
  if (!grade || !Number.isFinite(strength) || strength <= 0) return undefined;
  const amount = Math.min(strength, 100) / 100;
  const luminance = [0.2126, 0.7152, 0.0722];
  const coefficients = grade.gain.flatMap((gain, row) => [
    ...luminance.map((weight, column) => {
      const identity = Number(column === row);
      const saturated =
        weight * (1 - grade.saturation) + identity * grade.saturation;
      const target = saturated * grade.contrast * gain;
      return identity * (1 - amount) + target * amount;
    }),
    0,
    0.5 * (1 - grade.contrast) * gain * amount,
  ]);
  return [...coefficients, 0, 0, 0, 1, 0];
}

export const OUTPUT_APPEARANCE_GROUPS = Object.freeze([
  Object.freeze({ id: 'color-treatment', order: 10 }),
  Object.freeze({ id: 'custom-color', order: 20 }),
  Object.freeze({ id: 'typography', order: 30 }),
  Object.freeze({ id: 'readability', order: 40 }),
  Object.freeze({ id: 'surface', order: 50 }),
  Object.freeze({ id: 'decoration', order: 55 }),
  Object.freeze({ id: 'material', order: 56 }),
  Object.freeze({ id: 'layout', order: 60 }),
  Object.freeze({ id: 'portrait', order: 65 }),
  Object.freeze({ id: 'motion', order: 70 }),
  Object.freeze({ id: 'content', order: 80 }),
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
const PORTRAIT_ID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
// Legacy slot overrides use a stable ID outside the range of newly generated v4 IDs.
const LEGACY_PHANTOM_PORTRAIT_ID = '00000000-0000-5000-8000-000000000001';
export const PHANTOM_PORTRAIT_NAME_MAX = 80;
export const MAX_PHANTOM_PORTRAIT_SETS = 12;
export const PHANTOM_PORTRAIT_FIELDS = Object.freeze([
  'phantomArtistName',
  'phantomPortraitPhoto',
  'phantomPortraitColor',
]);

const PHANTOM_PORTRAIT_TONES = ['indigo', 'plum', 'red', 'amber'];

export function phantomPortraitTone(artist, trackId) {
  const identity = (artist?.trim() || trackId || '')
    .normalize('NFC')
    .toLowerCase();
  let hash = 0;
  for (const character of identity) {
    hash = Math.imul(hash, 31) + character.codePointAt(0);
  }
  return PHANTOM_PORTRAIT_TONES[(hash >>> 0) % PHANTOM_PORTRAIT_TONES.length];
}

export function isPhantomPortraitId(value) {
  return typeof value === 'string' && PORTRAIT_ID_RE.test(value);
}

export function activePhantomPortraitSet(value) {
  if (!isPhantomPortraitId(value?.activeId) || !Array.isArray(value.items)) {
    return undefined;
  }
  return value.items.find((item) => item?.id === value.activeId);
}

export function canAddPhantomPortraitSet(items) {
  return (
    items.filter(({ id }) => id !== LEGACY_PHANTOM_PORTRAIT_ID).length <
    MAX_PHANTOM_PORTRAIT_SETS
  );
}
const MAX_LOCAL_FONT_NAME_LENGTH = 160;
const UNSAFE_LOCAL_FONT_NAME_RE = /[\\/;{}<>]|(?:url|var)\s*\(/iu;
const GROUP_MAP = new Map(
  OUTPUT_APPEARANCE_GROUPS.map((group) => [group.id, group]),
);
const FISHEYE_PAIRED_MOTION_IDS = ['arc', 'scale', 'swirl', 'cut'];
const FISHEYE_DECORATION_STRENGTH = Object.freeze({
  off: 0,
  soft: 50,
  standard: 100,
});

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
    control: 'select',
    defaultValue: 'down',
    options: [{ id: 'down' }, { id: 'up' }],
  }),
  fieldDefinition('motion', {
    key: 'receiptReview',
    family: 'motion',
    tier: 'basic',
    reflow: false,
    order: 10,
    control: 'select',
    defaultValue: 'on',
    options: [{ id: 'on' }, { id: 'off' }],
  }),
  fieldDefinition('motion', {
    key: 'receiptReviewInterval',
    family: 'motion',
    tier: 'basic',
    reflow: false,
    order: 20,
    control: 'range',
    defaultValue: 15,
    min: 5,
    max: 60,
    step: 5,
  }),
  fieldDefinition('color-treatment', {
    key: 'paletteId',
    family: 'document',
    tier: 'basic',
    reflow: false,
    order: 10,
    control: 'select',
    editor: 'look',
    defaultValue: 'original',
    options: Object.keys(OUTPUT_LOOK_PRESETS).map((id) => ({ id })),
  }),
  fieldDefinition('color-treatment', {
    key: 'lookAmount',
    family: 'document',
    tier: 'basic',
    reflow: false,
    order: 20,
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
    control: 'select',
    editor: 'font-family',
    allowLocalFonts: true,
    defaultValue: 'sans',
    options: [
      { id: 'template' },
      { id: 'sans' },
      { id: 'serif' },
      { id: 'rounded' },
      { id: 'ornate' },
      { id: 'antique' },
      { id: 'lyrics-auto' },
      { id: 'chen-yu-luo-yan' },
      { id: 'klee-one' },
      { id: 'open-huninn' },
    ],
  }),
  fieldDefinition('typography', {
    key: 'fontScale',
    family: 'document',
    tier: 'basic',
    reflow: true,
    order: 20,
    control: 'select',
    editor: 'font-scale',
    defaultValue: 'medium',
    options: [{ id: 'small' }, { id: 'medium' }, { id: 'large' }],
  }),
  fieldDefinition('typography', {
    key: 'fontWeight',
    family: 'character',
    tier: 'basic',
    reflow: true,
    order: 30,
    control: 'select',
    defaultValue: 'semibold',
    options: [{ id: 'regular' }, { id: 'semibold' }, { id: 'bold' }],
  }),
  fieldDefinition('readability', {
    key: 'contrastStyle',
    family: 'legibility',
    tier: 'basic',
    reflow: false,
    order: 10,
    control: 'select',
    defaultValue: 'balanced',
    options: [{ id: 'clean' }, { id: 'balanced' }, { id: 'strong-outline' }],
  }),
  fieldDefinition('typography', {
    key: 'textShadow',
    family: 'legibility',
    tier: 'basic',
    reflow: false,
    order: 40,
    control: 'select',
    defaultValue: 'standard',
    options: [{ id: 'standard' }, { id: 'off' }],
  }),
  fieldDefinition('typography', {
    key: 'sectionAccent',
    family: 'legibility',
    tier: 'basic',
    reflow: false,
    order: 50,
    control: 'select',
    defaultValue: 'off',
    options: [{ id: 'off' }, { id: 'auto' }],
  }),
  fieldDefinition('layout', {
    key: 'alignment',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 10,
    control: 'select',
    editor: 'alignment',
    defaultValue: 'left',
    options: [{ id: 'left' }, { id: 'center' }, { id: 'right' }],
  }),
  fieldDefinition('surface', {
    key: 'surface',
    family: 'fill',
    tier: 'basic',
    reflow: false,
    order: 10,
    control: 'select',
    defaultValue: 'transparent',
    options: [{ id: 'transparent' }, { id: 'soft' }, { id: 'solid' }],
  }),
  fieldDefinition('decoration', {
    key: 'vinylSurfaceLight',
    family: 'asset',
    tier: 'basic',
    reflow: false,
    order: 40,
    control: 'select',
    defaultValue: 'off',
    options: [{ id: 'off' }, { id: 'soft' }, { id: 'standard' }],
  }),
  fieldDefinition('material', {
    key: 'filmGrainAmount',
    family: 'asset',
    tier: 'basic',
    reflow: false,
    order: 10,
    control: 'range',
    defaultValue: 0,
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
  }),
  fieldDefinition('material', {
    key: 'filmGrainSize',
    family: 'asset',
    tier: 'basic',
    reflow: false,
    order: 20,
    control: 'select',
    defaultValue: 'medium',
    options: [{ id: 'fine' }, { id: 'medium' }, { id: 'coarse' }],
  }),
  fieldDefinition('content', {
    key: 'furigana',
    family: 'document',
    tier: 'basic',
    reflow: true,
    order: 10,
    control: 'select',
    defaultValue: 'auto',
    options: [{ id: 'auto' }, { id: 'off' }],
  }),
  fieldDefinition('readability', {
    key: 'kineticMaterial',
    family: 'legibility',
    tier: 'basic',
    reflow: false,
    order: 20,
    control: 'select',
    defaultValue: 'candy-rim',
    options: [
      { id: 'solid-outline' },
      { id: 'candy-rim' },
      { id: 'chromatic-depth' },
      { id: 'cycle' },
    ],
  }),
  fieldDefinition('layout', {
    key: 'kineticArrangement',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 20,
    control: 'select',
    defaultValue: 'straight',
    options: [{ id: 'straight' }, { id: 'subtle-offset' }],
  }),
  fieldDefinition('layout', {
    key: 'phantomMode',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 10,
    control: 'select',
    defaultValue: 'side-card',
    options: [
      { id: 'side-card' },
      { id: 'radial' },
      { id: 'ransom' },
      { id: 'chat' },
      { id: 'choice-stack' },
    ],
  }),
  fieldDefinition('layout', {
    key: 'phantomChatShape',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 20,
    control: 'select',
    defaultValue: 'bubble',
    options: [
      { id: 'bubble' },
      { id: 'thought' },
      { id: 'stacked' },
      { id: 'phone' },
    ],
  }),
  fieldDefinition('layout', {
    key: 'mangaBubbleStyle',
    family: 'layout',
    tier: 'basic',
    reflow: false,
    order: 20,
    control: 'select',
    defaultValue: DEFAULT_MANGA_FRAME_ID,
    options: MANGA_BUBBLE_STYLE_IDS.map((id) => ({ id })),
  }),
  fieldDefinition('layout', {
    key: 'mangaTailDirection',
    family: 'layout',
    tier: 'basic',
    reflow: false,
    order: 30,
    control: 'select',
    defaultValue: 'performer',
    options: [{ id: 'performer' }, { id: 'fixed' }],
  }),
  fieldDefinition('layout', {
    key: 'phantomCardStyle',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 20,
    control: 'select',
    defaultValue: 'portrait',
    options: [{ id: 'portrait' }, { id: 'text-only' }],
  }),
  fieldDefinition('portrait', {
    key: 'phantomPortraitColor',
    family: 'fill',
    tier: 'basic',
    reflow: false,
    order: 30,
    control: 'color',
    defaultValue: '',
  }),
  fieldDefinition('portrait', {
    key: 'phantomArtistName',
    family: 'document',
    tier: 'basic',
    reflow: true,
    order: 10,
    control: 'text',
    maxLength: PHANTOM_PORTRAIT_NAME_MAX,
    defaultValue: '',
  }),
  fieldDefinition('portrait', {
    key: 'phantomPortraitPhoto',
    family: 'asset',
    tier: 'basic',
    reflow: false,
    order: 20,
    control: 'portrait-photo',
    defaultValue: '',
  }),
  fieldDefinition('typography', {
    key: 'phantomRansomFont',
    family: 'character',
    tier: 'basic',
    reflow: true,
    order: 15,
    control: 'select',
    defaultValue: 'kaitou',
    options: [{ id: 'kaitou' }, { id: 'kaibunsyo' }, { id: 'none' }],
  }),
  fieldDefinition('layout', {
    key: 'phantomCorner',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 30,
    control: 'select',
    defaultValue: 'auto',
    options: [
      { id: 'auto' },
      { id: 'top-left' },
      { id: 'top-right' },
      { id: 'bottom-left' },
      { id: 'bottom-right' },
    ],
  }),
  fieldDefinition('custom-color', {
    key: 'textColor',
    family: 'swatch',
    tier: 'advanced',
    reflow: false,
    order: 10,
    control: 'color',
    defaultValue: '#fff8ec',
  }),
  fieldDefinition('custom-color', {
    key: 'accentColor',
    family: 'swatch',
    tier: 'advanced',
    reflow: false,
    order: 20,
    control: 'color',
    defaultValue: '#ffffff',
  }),
  fieldDefinition('custom-color', {
    key: 'chalkboardRuleColor',
    family: 'swatch',
    tier: 'advanced',
    reflow: false,
    order: 20,
    control: 'color',
    defaultValue: '#fffdfa',
  }),
  fieldDefinition('layout', {
    key: 'positionAnchor',
    family: 'layout',
    tier: 'basic',
    reflow: false,
    order: 30,
    control: 'select',
    editor: 'position-grid',
    defaultValue: 'center-right',
    options: [
      { id: 'top-left' },
      { id: 'top-center' },
      { id: 'top-right' },
      { id: 'center-left' },
      { id: 'center' },
      { id: 'center-right' },
      { id: 'bottom-left' },
      { id: 'bottom-center' },
      { id: 'bottom-right' },
    ],
  }),
  fieldDefinition('layout', {
    key: 'positionOffsetX',
    family: 'layout',
    tier: 'advanced',
    reflow: false,
    order: 40,
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
    control: 'select',
    defaultValue: 'normal',
    options: [{ id: 'compact' }, { id: 'normal' }, { id: 'relaxed' }],
  }),
  fieldDefinition('layout', {
    key: 'contentWidth',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 70,
    control: 'select',
    defaultValue: 'standard',
    options: [{ id: 'narrow' }, { id: 'standard' }, { id: 'wide' }],
  }),
  ...['fisheyeRim', 'fisheyeReflection'].map((key, index) =>
    fieldDefinition('decoration', {
      key,
      family: 'asset',
      tier: 'basic',
      reflow: false,
      order: 20 + index * 10,
      control: 'select',
      defaultValue: 'standard',
      options: Object.keys(FISHEYE_DECORATION_STRENGTH).map((id) => ({ id })),
    }),
  ),
  fieldDefinition('layout', {
    key: 'fisheyeLayout',
    family: 'layout',
    tier: 'basic',
    reflow: true,
    order: 90,
    control: 'select',
    defaultValue: 'auto',
    options: [{ id: 'auto' }, { id: 'standard' }, { id: 'close' }],
  }),
  ...['fisheyeEnter', 'fisheyeExit', 'fisheyeBlur'].map((key, index) =>
    fieldDefinition('motion', {
      key,
      family: 'motion',
      tier: 'basic',
      reflow: false,
      order: 30 + index * 10,
      control: 'select',
      defaultValue: ['arc', 'auto', 'off'][index],
      options: (index === 2
        ? ['off', 'on']
        : index === 0
          ? [...FISHEYE_PAIRED_MOTION_IDS, 'smoke']
          : ['auto', ...FISHEYE_PAIRED_MOTION_IDS]
      ).map((id) => ({ id })),
    }),
  ),
  fieldDefinition('motion', {
    key: 'fisheyePulse',
    family: 'motion',
    tier: 'basic',
    reflow: false,
    order: 45,
    control: 'range',
    defaultValue: 100,
    min: 0,
    max: 100,
    step: 5,
    unit: '%',
  }),
  fieldDefinition('content', {
    key: 'fisheyeGranularity',
    family: 'document',
    tier: 'basic',
    reflow: true,
    order: 20,
    control: 'select',
    defaultValue: 'line',
    options: [{ id: 'line' }, { id: 'phrase' }, { id: 'segment' }],
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
        control: 'select',
        defaultValue: 'inherit',
        options: [
          { id: 'inherit' },
          { id: 'regular' },
          { id: 'semibold' },
          { id: 'bold' },
        ],
      }),
      fieldDefinition('typography', {
        key: 'fontSizeScale',
        family: 'character',
        tier: 'basic',
        reflow: true,
        scope: 'element',
        order: 20,
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
        control: 'select',
        defaultValue: 'shown',
        options: [{ id: 'shown' }, { id: 'hidden' }],
      }),
    ].map((definition) => [definition.key, definition]),
  ),
);

const ELEMENT_SETTING_KEY_RE = /^element.([a-z][a-z0-9-]*).([A-Za-z]+)$/u;
const LOOK_KEYS = ['paletteId', 'lookAmount'];
const MATERIAL_GRAIN_KEYS = ['filmGrainAmount', 'filmGrainSize'];
const SLOT_APPEARANCE_KEYS = new Set([
  ...LOOK_KEYS,
  ...MATERIAL_GRAIN_KEYS,
  'fontFamily',
  'fontScale',
  'fontWeight',
  'contrastStyle',
  'receiptReview',
  'receiptReviewInterval',
]);
const BASIC_APPEARANCE_KEYS = Object.freeze([
  ...LOOK_KEYS,
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

export function isSharedOutputAppearanceField(field) {
  return field?.scope !== 'element' && SLOT_APPEARANCE_KEYS.has(field?.key);
}

export function isSharedOutputFont(value) {
  return BASIC_FONT_IDS.includes(value) || isOutputLocalFont(value);
}
const ORNATE_FONT_IDS = Object.freeze(['ornate', 'antique']);
const MANGA_FONT_IDS = Object.freeze(['antique']);
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

const TEMPLATE_OVERRIDES = {
  'receipt-setlist': {
    keys: [
      'fontFamily',
      'fontScale',
      'receiptDirection',
      'receiptReview',
      'receiptReviewInterval',
    ],
    fields: {
      fontFamily: { defaultValue: 'template', optionIds: ['template'] },
      fontScale: { defaultValue: 'medium' },
    },
  },
  'ribbon-setlist': {
    keys: ['fontFamily', 'surface', 'receiptReview', 'receiptReviewInterval'],
    fields: {
      fontFamily: { defaultValue: 'template', optionIds: ['template'] },
      surface: { defaultValue: 'solid', optionIds: ['solid', 'transparent'] },
    },
  },
  'art-card': {
    keys: ['fontFamily', 'fontScale', 'fontWeight', 'vinylSurfaceLight'],
    fields: NOW_PLAYING_FIELD_DEFAULTS,
  },
  'ticket-stub': {
    keys: ['fontFamily', 'fontScale', 'fontWeight'],
    fields: NOW_PLAYING_FIELD_DEFAULTS,
  },
  'cover-player': {
    keys: ['fontFamily', 'fontScale', 'fontWeight', 'surface'],
    fields: NOW_PLAYING_FIELD_DEFAULTS,
  },
  'queue-board': {
    keys: [
      'fontFamily',
      'fontScale',
      'fontWeight',
      'surface',
      'spacingDensity',
    ],
    fields: SETLIST_FIELD_DEFAULTS,
  },
  'focus-line': {
    keys: BASIC_APPEARANCE_KEYS.filter((key) => !LOOK_KEYS.includes(key)),
    fields: LYRICS_FIELD_DEFAULTS,
  },
  'karaoke-stack': {
    keys: ['fontFamily', 'fontScale'],
    fields: {
      fontFamily: { defaultValue: 'template', optionIds: ['template'] },
    },
  },
  'textured-credits': {
    keys: ['fontFamily', 'fontScale', 'alignment'],
    fields: {
      fontFamily: { defaultValue: 'ornate', optionIds: ['ornate'] },
      alignment: { defaultValue: 'center' },
    },
  },
  'kinetic-pop': {
    keys: ['fontFamily', 'fontScale', 'kineticMaterial', 'kineticArrangement'],
    fields: {
      fontFamily: { defaultValue: 'template', optionIds: ['template'] },
    },
  },
  'phantom-thieves': {
    keys: [
      'phantomMode',
      'phantomChatShape',
      'phantomCardStyle',
      'phantomPortraitColor',
      'phantomArtistName',
      'phantomPortraitPhoto',
      'phantomCorner',
      'fontFamily',
      'phantomRansomFont',
      'fontScale',
    ],
    fields: {
      fontFamily: { defaultValue: 'template', optionIds: ['template'] },
    },
  },
  'fisheye-lens': {
    keys: [
      'fisheyeLayout',
      'fontFamily',
      'fontScale',
      'textColor',
      'fisheyeRim',
      'fisheyeReflection',
      'fisheyeEnter',
      'fisheyeExit',
      'fisheyePulse',
      'fisheyeBlur',
      'fisheyeGranularity',
    ],
    fields: {
      fontFamily: { defaultValue: 'template', optionIds: ['template'] },
      textColor: { defaultValue: '#a3f39e' },
    },
  },
  'centered-vertical': {
    keys: ['fontFamily', 'fontScale', 'contrastStyle', 'textColor'],
    fields: {
      textColor: { defaultValue: '#fffdfa' },
      fontScale: { defaultValue: 'small' },
      fontFamily: {
        defaultValue: 'lyrics-auto',
        optionIds: [
          'lyrics-auto',
          'chen-yu-luo-yan',
          'klee-one',
          'open-huninn',
        ],
      },
    },
  },
  'chalkboard-vertical': {
    keys: [
      'fontFamily',
      'fontScale',
      'textColor',
      'chalkboardRuleColor',
      'positionAnchor',
      'positionOffsetX',
      'positionOffsetY',
    ],
    fields: {
      fontFamily: { defaultValue: 'template', optionIds: ['template'] },
      textColor: { defaultValue: '#fffdfa' },
      positionAnchor: {
        defaultValue: 'center-left',
        optionIds: ['center-left', 'center-right'],
      },
    },
  },
  'ornate-vertical': {
    keys: [
      'textColor',
      'accentColor',
      'fontFamily',
      'fontScale',
      'textShadow',
      'sectionAccent',
      'positionAnchor',
      'positionOffsetX',
      'positionOffsetY',
    ],
    fields: {
      fontFamily: { defaultValue: 'ornate', optionIds: ORNATE_FONT_IDS },
      positionAnchor: {
        defaultValue: 'top-right',
        optionIds: ORNATE_POSITION_IDS,
      },
    },
  },
  'manga-frame': {
    keys: [
      'fontFamily',
      'fontScale',
      'fontWeight',
      'furigana',
      'mangaBubbleStyle',
      'mangaTailDirection',
    ],
    fields: {
      fontFamily: { defaultValue: 'antique', optionIds: MANGA_FONT_IDS },
      fontScale: { defaultValue: 'medium' },
      fontWeight: { defaultValue: 'bold' },
      furigana: { defaultValue: 'auto' },
    },
  },
  'live-stage': {
    keys: ['fontFamily', 'fontScale', 'contrastStyle'],
    fields: {
      fontFamily: {
        defaultValue: 'sans',
      },
      fontScale: { defaultValue: 'medium' },
    },
  },
};

const TEMPLATE_CONFIGS = Object.fromEntries(
  Object.entries(TEMPLATE_OVERRIDES).map(([id, config]) => [
    id,
    { ...config, keys: [...LOOK_KEYS, ...config.keys, ...MATERIAL_GRAIN_KEYS] },
  ]),
);

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

export function sanitizeOutputTranslationFontScale(value) {
  return sanitizedRangeValue(OUTPUT_TRANSLATION_FONT_SCALE, value);
}

function legacyFisheyeDecorationStyle(value) {
  const normalized = sanitizedRangeValue({ min: 0, max: 100, step: 5 }, value);
  if (normalized === undefined) return undefined;
  if (normalized === 0) return 'off';
  return normalized < 75 ? 'soft' : 'standard';
}

export function fisheyeDecorationStrength(style) {
  return Object.hasOwn(FISHEYE_DECORATION_STRENGTH, style)
    ? FISHEYE_DECORATION_STRENGTH[style]
    : FISHEYE_DECORATION_STRENGTH.standard;
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

const SYSTEM_SANS =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const OPEN_HUNINN = "'Utawakui Open Huninn', sans-serif";
const OPEN_HUNINN_CJK =
  "'Utawakui Open Huninn', 'Microsoft JhengHei', 'Noto Sans CJK TC', sans-serif";
const PRESET_FONT_STACKS = Object.freeze({
  sans: SYSTEM_SANS,
  serif:
    "'GenWanMin2 TW', 'GenWanMin2 TC', 'GenWanMin2 PJP', 'Noto Serif TC', 'Noto Serif JP', 'Noto Serif KR', 'Microsoft JhengHei', serif",
  rounded:
    "'Arial Rounded MT Bold', 'Yu Gothic UI', 'Microsoft JhengHei', sans-serif",
  ornate:
    "'Utawakui Hina Mincho', 'Hina Mincho', 'Yu Mincho', 'Noto Serif CJK JP', serif",
  antique: "'Utawakui GenEi Antique', 'Noto Serif CJK JP', 'Yu Mincho', serif",
  'open-huninn': OPEN_HUNINN,
  'chen-yu-luo-yan': `'Utawakui ChenYuLuoYan', ${OPEN_HUNINN}`,
  'klee-one': `'Utawakui Klee One', ${OPEN_HUNINN}`,
});
const TEMPLATE_FONT_STACKS = Object.freeze({
  'karaoke-stack': OPEN_HUNINN_CJK,
  'chalkboard-vertical': OPEN_HUNINN,
  'fisheye-lens':
    "'Microsoft JhengHei', 'Yu Gothic', 'Noto Sans CJK TC', sans-serif",
  'receipt-setlist':
    "'Yu Gothic UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', sans-serif",
});
const RIBBON_FONT_STACKS = Object.freeze({
  zh: `'Microsoft JhengHei', 'Noto Sans CJK TC', ${SYSTEM_SANS}`,
  ja: `'Yu Gothic UI', 'Noto Sans CJK JP', ${SYSTEM_SANS}`,
  ko: `'Malgun Gothic', 'Noto Sans CJK KR', ${SYSTEM_SANS}`,
});

export function outputFontFamilyCss(
  value,
  templateId,
  language = '',
  kineticMaterial = 'candy-rim',
) {
  const primaryLanguage = language.toLowerCase().split('-')[0];
  const localFamily = outputLocalFontCssValue(value);
  const preset = localFamily
    ? (templateConfig(templateId).fields?.fontFamily?.defaultValue ?? 'sans')
    : value;
  let stack = Object.hasOwn(PRESET_FONT_STACKS, preset)
    ? PRESET_FONT_STACKS[preset]
    : SYSTEM_SANS;
  if (preset === 'lyrics-auto') {
    if (primaryLanguage === 'ja') stack = PRESET_FONT_STACKS['klee-one'];
    else if (
      primaryLanguage === 'zh' &&
      !/^zh-(hans|cn|sg)(-|$)/i.test(language)
    ) {
      stack = PRESET_FONT_STACKS['chen-yu-luo-yan'];
    } else stack = OPEN_HUNINN;
  } else if (preset === 'template') {
    if (templateId === 'ribbon-setlist') {
      stack = RIBBON_FONT_STACKS[primaryLanguage] ?? SYSTEM_SANS;
    } else if (templateId === 'kinetic-pop') {
      if (kineticMaterial === 'candy-rim' || kineticMaterial === 'cycle') {
        stack =
          "'Utawakui Keifont', 'Utawakui M PLUS Rounded 1c', 'Noto Sans CJK JP', sans-serif";
      } else {
        stack =
          primaryLanguage === 'zh'
            ? OPEN_HUNINN_CJK
            : "'Utawakui M PLUS Rounded 1c', 'M PLUS Rounded 1c', 'Noto Sans CJK JP', sans-serif";
      }
    } else stack = TEMPLATE_FONT_STACKS[templateId] ?? SYSTEM_SANS;
  }
  return localFamily ? `${localFamily}, ${stack}` : stack;
}

export const OUTPUT_APPEARANCE_FIELDS = Object.freeze(
  FIELD_DEFINITIONS.map((field) => Object.freeze(cloneField(field))),
);

export const OUTPUT_APPEARANCE_DEFAULTS = Object.freeze(
  Object.fromEntries(
    FIELD_DEFINITIONS.map((field) => [field.key, field.defaultValue]),
  ),
);

export const PHANTOM_PORTRAIT_DEFAULTS = Object.freeze(
  Object.fromEntries(
    PHANTOM_PORTRAIT_FIELDS.map((key) => [
      key,
      OUTPUT_APPEARANCE_DEFAULTS[key],
    ]),
  ),
);

export function sanitizePhantomPortraitSets(value) {
  const items = [];
  const ids = new Set();
  // A legacy override can coexist with all 12 previously saved custom sets.
  const candidates = Array.isArray(value?.items)
    ? value.items.slice(0, MAX_PHANTOM_PORTRAIT_SETS + 1)
    : [];
  let customCount = 0;
  for (const item of candidates) {
    if (!isPhantomPortraitId(item?.id) || ids.has(item.id)) continue;
    if (item.id !== LEGACY_PHANTOM_PORTRAIT_ID) {
      if (customCount >= MAX_PHANTOM_PORTRAIT_SETS) continue;
      customCount += 1;
    }
    ids.add(item.id);
    const fields = PHANTOM_PORTRAIT_FIELDS.map((key) => [
      key,
      sanitizeOutputAppearanceSetting(key, item[key]) ??
        PHANTOM_PORTRAIT_DEFAULTS[key],
    ]);
    items.push({ id: item.id, ...Object.fromEntries(fields) });
  }
  return { activeId: ids.has(value?.activeId) ? value.activeId : '', items };
}

export function migrateLegacyPhantomPortraitSettings(settings) {
  const entries = PHANTOM_PORTRAIT_FIELDS.map((key) => [
    key,
    sanitizeOutputAppearanceSetting(key, settings?.[key]) ??
      PHANTOM_PORTRAIT_DEFAULTS[key],
  ]);
  if (
    entries.every(([key, value]) => value === PHANTOM_PORTRAIT_DEFAULTS[key])
  ) {
    return settings;
  }
  const portrait = Object.fromEntries(entries);
  if (
    !portrait.phantomArtistName &&
    !portrait.phantomPortraitPhoto &&
    portrait.phantomPortraitColor === '#f3d648'
  ) {
    // The old built-in first tile stored its yellow default as an ordinary color.
    return { ...settings, phantomPortraitColor: '' };
  }
  const { activeId, items } = sanitizePhantomPortraitSets(
    settings.phantomPortraitSets,
  );
  const existing = items.find(
    (item) =>
      item.id === LEGACY_PHANTOM_PORTRAIT_ID ||
      entries.every(([key, value]) => item[key] === value),
  );
  const id = existing?.id ?? LEGACY_PHANTOM_PORTRAIT_ID;
  return {
    ...settings,
    ...PHANTOM_PORTRAIT_DEFAULTS,
    phantomPortraitSets: {
      activeId: activeId || id,
      items: existing ? items : [{ id, ...portrait }, ...items],
    },
  };
}

export function ornateSectionAccentColor(appearance) {
  return appearance.accentColor === OUTPUT_APPEARANCE_DEFAULTS.accentColor
    ? '#d96879'
    : appearance.accentColor;
}

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
    fontFamily: 'template',
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
    fontFamily: 'template',
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
  if (
    (baseField.family === 'asset' || baseField.group === 'portrait') &&
    options.templateId &&
    !templateConfig(options.templateId).keys.includes(key)
  )
    return undefined;
  let sanitized;
  if (key === 'mangaTailDirection' && value === 'default') value = 'performer';
  if (key === 'fisheyeRim' || key === 'fisheyeReflection')
    value = legacyFisheyeDecorationStyle(value) ?? value;
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
      typeof value === 'string' &&
      (COLOR_RE.test(value) || (key === 'phantomPortraitColor' && value === ''))
        ? value.toLowerCase()
        : undefined;
  } else if (baseField.control === 'range') {
    sanitized = sanitizedRangeValue(baseField, value);
  } else if (baseField.control === 'text' && typeof value === 'string') {
    const name = [...value].filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint >= 32 && codePoint !== 127;
    });
    sanitized = name
      .join('')
      .trim()
      .slice(0, baseField.maxLength)
      .toWellFormed();
  } else if (
    baseField.control === 'portrait-photo' &&
    (value === '' || isPhantomPortraitId(value))
  ) {
    sanitized = value;
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
    if (key !== 'fontFamily') return cloneField(field, templateOverride);
    const optionIds = [
      ...(templateOverride.optionIds ?? []),
      ...BASIC_FONT_IDS,
    ];
    const options = new Map(field.options.map((option) => [option.id, option]));
    return {
      ...cloneField(field, templateOverride),
      ...(Object.hasOwn(TEMPLATE_CONFIGS, templateId) ? { templateId } : {}),
      options: optionIds.map((id) => ({ ...options.get(id) })),
    };
  });
}

export function isOutputAppearanceFieldVisible({ group, key }, settings) {
  const { phantomMode } = settings;
  return (
    (group !== 'portrait' || phantomMode === 'side-card') &&
    (key !== 'phantomChatShape' || phantomMode === 'chat') &&
    (key !== 'phantomCardStyle' || phantomMode === 'side-card') &&
    (key !== 'phantomRansomFont' || phantomMode === 'ransom')
  );
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
  const portraitSet =
    templateId === 'phantom-thieves'
      ? activePhantomPortraitSet(settings?.phantomPortraitSets)
      : undefined;
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
          (baseField.group === 'portrait'
            ? (portraitSet ?? settings)
            : settings)?.[baseField.key],
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
