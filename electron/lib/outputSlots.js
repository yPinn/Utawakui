'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson, backupCorrupted } = require('./atomicWrite');
const {
  activePhantomPortraitSet,
  PHANTOM_PORTRAIT_FIELDS,
  OUTPUT_APPEARANCE_DEFAULTS,
  OUTPUT_SLOT_APPEARANCE_DEFAULTS,
  isOutputElementSettingKey,
  isOutputLocalFont,
  isSharedOutputAppearanceField,
  isSharedOutputFont,
  migrateLegacyPhantomPortraitSettings,
  outputAppearanceFieldsForTemplate,
  sanitizePhantomPortraitSets,
  sanitizeOutputAppearanceSetting,
  sanitizeOutputTranslationFontScale,
} = require('../../shared/outputAppearance.mjs');
const {
  normalizeOutputRecentColors,
  normalizeOutputSavedColors,
} = require('../../shared/outputColorPreferences.mjs');
const OUTPUT_CAPTURE_VALUES = require('../../shared/outputCaptureValues.json');
const OUTPUT_TEMPLATE_VALUES = require('../../shared/outputTemplateValues.json');
const {
  sanitizeLyricsPresentationPolicyId,
} = require('../../shared/presentation/lyricsPresentationPolicies.mjs');
const {
  sanitizeMangaTailCoordinate,
} = require('../../shared/presentation/mangaFrameContract.mjs');

const OUTPUT_SLOTS_FILENAME = 'overlays.json';
const OUTPUT_SLOTS_VERSION = 5;
const PREVIOUS_FONT_OPTIONS = new Map([
  ['receipt-setlist', []],
  ['ribbon-setlist', []],
  ['ticket-stub', []],
  ['cover-player', []],
  ['karaoke-stack', []],
  ['kinetic-pop', []],
  ['fisheye-lens', []],
  ['chalkboard-vertical', []],
  [
    'centered-vertical',
    ['lyrics-auto', 'chen-yu-luo-yan', 'klee-one', 'open-huninn'],
  ],
  ['ornate-vertical', ['ornate', 'antique']],
]);
const MAX_STYLE_SET_IDS = 32;
const MAX_SETTINGS = 100;
const MAX_ID_LENGTH = 100;
const MAX_SETTING_STRING_LENGTH = 1000;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_SETTING_KEY_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;
const SLOT_IDS = new Set(OUTPUT_TEMPLATE_VALUES.slots.map((slot) => slot.id));
const TEMPLATE_KINDS = OUTPUT_TEMPLATE_VALUES.templateKinds;
const TEMPLATE_ALIASES = OUTPUT_TEMPLATE_VALUES.templateAliases;
const WIDGET_CAPTURE_SIZE_IDS = new Set(
  OUTPUT_CAPTURE_VALUES.widgetSizes.map((size) => size.id),
);

function normalizeCaptureSize(kind, templateId, value) {
  if (kind === 'lyrics') return OUTPUT_CAPTURE_VALUES.lyricsSize.id;
  const configured = OUTPUT_TEMPLATE_VALUES.templateCaptureSizes?.[templateId];
  const supported = (configured?.supported ?? []).filter((id) =>
    WIDGET_CAPTURE_SIZE_IDS.has(id),
  );
  const allowed = supported.length
    ? supported
    : [OUTPUT_CAPTURE_VALUES.slotDefaults[kind]];
  if (allowed.includes(value)) return value;
  return allowed.includes(configured?.default)
    ? configured.default
    : allowed[0];
}

function emptyDocument() {
  return normalizeDocument({ slots: {} });
}

function safeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_ID_LENGTH);
  return SAFE_ID_RE.test(trimmed) ? trimmed : null;
}

function sanitizeSettings(value, templateId) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const entries = [];
  for (const [key, setting] of Object.entries(value)) {
    if (entries.length >= MAX_SETTINGS) break;
    if (!SAFE_SETTING_KEY_RE.test(key) || key.length > MAX_ID_LENGTH) continue;
    if (key === 'mangaTailX' || key === 'mangaTailY') {
      const coordinate = sanitizeMangaTailCoordinate(setting);
      if (templateId === 'manga-frame' && coordinate !== undefined)
        entries.push([key, coordinate]);
      continue;
    }
    if (key === 'translationFontScale') {
      const normalized = sanitizeOutputTranslationFontScale(setting);
      if (TEMPLATE_KINDS[templateId] === 'lyrics' && normalized !== undefined)
        entries.push([key, normalized]);
      continue;
    }
    if (key === 'lyricsPresentationPolicyId') {
      const normalized = sanitizeLyricsPresentationPolicyId(
        templateId,
        setting,
      );
      if (normalized !== undefined) entries.push([key, normalized]);
      continue;
    }
    if (key === 'phantomPortraitSets') {
      if (TEMPLATE_KINDS[templateId] === 'lyrics') {
        entries.push([key, sanitizePhantomPortraitSets(setting)]);
      }
      continue;
    }
    if (
      PHANTOM_PORTRAIT_FIELDS.includes(key) &&
      TEMPLATE_KINDS[templateId] === 'lyrics'
    ) {
      const normalized = sanitizeOutputAppearanceSetting(key, setting);
      if (normalized !== undefined) entries.push([key, normalized]);
      continue;
    }
    if (
      Object.hasOwn(OUTPUT_APPEARANCE_DEFAULTS, key) ||
      isOutputElementSettingKey(key)
    ) {
      const normalized = sanitizeOutputAppearanceSetting(key, setting, {
        templateId,
      });
      if (normalized !== undefined) entries.push([key, normalized]);
      continue;
    }
    if (typeof setting === 'string') {
      entries.push([key, setting.slice(0, MAX_SETTING_STRING_LENGTH)]);
    } else if (typeof setting === 'boolean' || setting === null) {
      entries.push([key, setting]);
    } else if (typeof setting === 'number' && Number.isFinite(setting)) {
      entries.push([key, setting]);
    }
  }
  return Object.fromEntries(entries);
}

function sanitizeOutputSlot(kindValue, value) {
  const kind = safeId(kindValue);
  if (!kind || !SLOT_IDS.has(kind)) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const savedId = safeId(value.templateId);
  const alias = Object.hasOwn(TEMPLATE_ALIASES, savedId);
  const templateId = alias ? TEMPLATE_ALIASES[savedId] : savedId;
  if (!templateId || TEMPLATE_KINDS[templateId] !== kind) return null;

  const styleSetIds = [];
  const seenStyleSetIds = new Set();
  for (const rawId of Array.isArray(value.styleSetIds)
    ? value.styleSetIds
    : []) {
    if (styleSetIds.length >= MAX_STYLE_SET_IDS) break;
    const styleSetId = safeId(rawId);
    if (!styleSetId || seenStyleSetIds.has(styleSetId)) continue;
    seenStyleSetIds.add(styleSetId);
    styleSetIds.push(styleSetId);
  }

  const settings = sanitizeSettings(value.settings, templateId);
  if (alias) settings.screenMaskLayout = savedId;
  settings.captureSize = normalizeCaptureSize(
    kind,
    templateId,
    settings.captureSize,
  );

  return {
    templateId,
    styleSetIds,
    settings:
      kind === 'lyrics'
        ? migrateLegacyPhantomPortraitSettings(settings)
        : settings,
  };
}

function sharedAppearance(settings) {
  return Object.fromEntries(
    Object.entries(settings ?? {}).flatMap(([key, raw]) => {
      if (!isSharedOutputAppearanceField({ key })) return [];
      const value = sanitizeOutputAppearanceSetting(key, raw);
      if (
        value === undefined ||
        (key === 'fontFamily' && !isSharedOutputFont(value))
      )
        return [];
      return [[key, value]];
    }),
  );
}

function templateAppearance(settings, templateId) {
  const fields = new Map(
    outputAppearanceFieldsForTemplate(templateId).map((field) => [
      field.key,
      field,
    ]),
  );
  return Object.fromEntries(
    Object.entries(sanitizeSettings(settings, templateId)).filter(
      ([key, value]) => {
        if (
          key === 'captureSize' ||
          key === 'lyricsPresentationPolicyId' ||
          key === 'mangaTailX' ||
          key === 'mangaTailY' ||
          isOutputElementSettingKey(key)
        )
          return true;
        const field = fields.get(key);
        if (!field) return false;
        if (field.options && !field.options.some(({ id }) => id === value))
          return false;
        if (key === 'fontFamily' && !isSharedOutputFont(value)) return true;
        return !isSharedOutputAppearanceField(field);
      },
    ),
  );
}

function normalizeAppearanceHistory(history) {
  const entries = [];
  for (const kind of SLOT_IDS) {
    const record = history?.[kind];
    if (!record) continue;
    const shared = sharedAppearance(record.shared);
    const templates = Object.fromEntries(
      Object.entries(TEMPLATE_KINDS)
        .filter(([id, owner]) => owner === kind && record.templates?.[id])
        .map(([id]) => [id, templateAppearance(record.templates[id], id)]),
    );
    for (const [previousId, id] of Object.entries(TEMPLATE_ALIASES)) {
      if (
        TEMPLATE_KINDS[id] !== kind ||
        templates[id] ||
        !record.templates?.[previousId]
      )
        continue;
      templates[id] = templateAppearance(
        {
          ...record.templates[previousId],
          screenMaskLayout: previousId,
        },
        id,
      );
    }
    entries.push([kind, { shared, templates }]);
  }
  return Object.fromEntries(entries);
}

function recallTemplateAppearance(current, next, history = {}, overrides) {
  const shared = { ...history.shared };
  const templates = { ...history.templates };
  const remembered = templateAppearance(current.settings, current.templateId);
  const fields = outputAppearanceFieldsForTemplate(current.templateId);
  const fieldKeys = new Set(fields.map(({ key }) => key));
  const slotDefaults =
    OUTPUT_SLOT_APPEARANCE_DEFAULTS[TEMPLATE_KINDS[current.templateId]];
  for (const [key, value] of Object.entries(
    sharedAppearance(current.settings),
  )) {
    if (
      !fieldKeys.has(key) &&
      !Object.hasOwn(shared, key) &&
      value !== slotDefaults[key]
    )
      shared[key] = value;
  }
  for (const field of fields) {
    if (!isSharedOutputAppearanceField(field)) continue;
    const { key, defaultValue } = field;
    const value = current.settings[key];
    if (value === undefined) continue;
    if (key === 'fontFamily' && !isSharedOutputFont(value)) {
      if (
        value === defaultValue &&
        !shared.fontFamily &&
        !templates[current.templateId]?.fontFamily
      )
        delete remembered.fontFamily;
      continue;
    }
    if (value !== defaultValue || Object.hasOwn(shared, key))
      shared[key] = value;
  }
  templates[current.templateId] = remembered;

  const settings = { ...templates[next.templateId] };
  for (const field of outputAppearanceFieldsForTemplate(next.templateId)) {
    const { key, options } = field;
    const value = shared[key];
    if (
      value !== undefined &&
      !Object.hasOwn(settings, key) &&
      (!options ||
        options.some(({ id }) => id === value) ||
        (key === 'fontFamily' &&
          field.allowLocalFonts &&
          isOutputLocalFont(value)))
    )
      settings[key] = value;
  }
  for (const key of ['translationFontScale', 'phantomPortraitSets']) {
    if (Object.hasOwn(current.settings, key))
      settings[key] = current.settings[key];
  }
  for (const key of Object.keys(overrides ?? {})) {
    if (Object.hasOwn(next.settings, key)) settings[key] = next.settings[key];
  }
  return { settings, history: { shared, templates } };
}

function normalizeDocument(value) {
  const slots = {};
  const source =
    typeof value?.slots === 'object' &&
    value.slots !== null &&
    !Array.isArray(value.slots)
      ? value.slots
      : {};
  for (const slot of OUTPUT_TEMPLATE_VALUES.slots) {
    const normalized =
      sanitizeOutputSlot(slot.id, source[slot.id]) ??
      sanitizeOutputSlot(slot.id, {
        templateId: slot.defaultTemplateId,
        styleSetIds: slot.defaultStyleSetIds,
        settings: {
          ...(OUTPUT_SLOT_APPEARANCE_DEFAULTS[slot.id] ??
            OUTPUT_APPEARANCE_DEFAULTS),
          captureSize: OUTPUT_CAPTURE_VALUES.slotDefaults[slot.id],
        },
      });
    slots[slot.id] = normalized;
  }
  const appearanceHistory = normalizeAppearanceHistory(
    value?.appearanceHistory,
  );
  return {
    version: OUTPUT_SLOTS_VERSION,
    slots,
    ...(Object.keys(appearanceHistory).length && { appearanceHistory }),
    preferences: {
      recentColors: normalizeOutputRecentColors(
        value?.preferences?.recentColors,
      ),
      savedColors: normalizeOutputSavedColors(value?.preferences?.savedColors),
    },
  };
}

function migrateV1Document(value) {
  const profiles = Array.isArray(value.profiles) ? value.profiles : [];
  const selected = profiles.find(
    (profile) => profile?.id === value.selectedProfileId,
  );
  const ordered = selected
    ? [selected, ...profiles.filter((profile) => profile !== selected)]
    : profiles;
  const slots = {};

  for (const profile of ordered) {
    const templateId = safeId(profile?.templateId);
    const kind = templateId ? TEMPLATE_KINDS[templateId] : null;
    if (!kind || slots[kind]) continue;
    const normalized = sanitizeOutputSlot(kind, profile);
    if (normalized) slots[kind] = normalized;
  }
  return migrateV3Document({ slots });
}

function migrateV2Document(value) {
  return migrateV3Document(normalizeDocument(value));
}

// v3 stored Manga's former serif default, which Japanese bubbles never showed;
// v4 makes GenEi Antique the default choice, so untouched slots keep that face.
function migrateV3Document(value) {
  const document = normalizeDocument(value);
  const lyrics = document.slots.lyrics;
  if (
    lyrics?.templateId === 'manga-frame' &&
    lyrics.settings.fontFamily === 'serif'
  ) {
    lyrics.settings.fontFamily = 'antique';
  }
  return dropInactiveLegacyFonts(document);
}

function dropInactiveLegacyFonts(document) {
  // A previously ignored setting must not start changing a template on upgrade.
  for (const slot of Object.values(document.slots)) {
    const allowed = PREVIOUS_FONT_OPTIONS.get(slot.templateId);
    if (allowed && !allowed.includes(slot.settings.fontFamily)) {
      delete slot.settings.fontFamily;
    }
  }
  return document;
}

function writeOutputSlots(dir, document) {
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteJson(path.join(dir, OUTPUT_SLOTS_FILENAME), document);
}

function loadOutputSlots(dir) {
  const filePath = path.join(dir, OUTPUT_SLOTS_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return emptyDocument();
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    backupCorrupted(filePath);
    return emptyDocument();
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    backupCorrupted(filePath);
    return emptyDocument();
  }
  if (
    Number.isSafeInteger(data.version) &&
    data.version > OUTPUT_SLOTS_VERSION
  ) {
    throw new Error(
      `Cannot load newer overlays.json version ${data.version}; supported version is ${OUTPUT_SLOTS_VERSION}`,
    );
  }

  if (data.version === 1 && Array.isArray(data.profiles)) {
    const migrated = migrateV1Document(data);
    fs.copyFileSync(filePath, `${filePath}.v1-${Date.now()}.bak`);
    writeOutputSlots(dir, migrated);
    return migrated;
  }
  if (data.version === 2 && data.slots) {
    const migrated = migrateV2Document(data);
    fs.copyFileSync(filePath, `${filePath}.v2-${Date.now()}.bak`);
    writeOutputSlots(dir, migrated);
    return migrated;
  }
  if (data.version === 3 && data.slots) {
    const migrated = migrateV3Document(data);
    fs.copyFileSync(filePath, `${filePath}.v3-${Date.now()}.bak`);
    writeOutputSlots(dir, migrated);
    return migrated;
  }
  if (data.version === 4 && data.slots) {
    const migrated = dropInactiveLegacyFonts(normalizeDocument(data));
    fs.copyFileSync(filePath, `${filePath}.v4-${Date.now()}.bak`);
    writeOutputSlots(dir, migrated);
    return migrated;
  }
  if (data.version !== OUTPUT_SLOTS_VERSION || !data.slots) {
    backupCorrupted(filePath);
    return emptyDocument();
  }
  return normalizeDocument(data);
}

function saveOutputSlots(dir, value = {}) {
  const document = normalizeDocument(value);
  writeOutputSlots(dir, document);
  return document;
}

function upsertOutputSlot(dir, kind, value) {
  const slot = sanitizeOutputSlot(kind, value);
  if (!slot) throw new TypeError('Invalid output slot');
  const document = loadOutputSlots(dir);
  const current = document.slots[kind];
  if (
    value.recallAppearance === true &&
    current.templateId !== slot.templateId
  ) {
    const recalled = recallTemplateAppearance(
      current,
      slot,
      document.appearanceHistory?.[kind],
      Object.hasOwn(TEMPLATE_ALIASES, safeId(value.templateId))
        ? {
            ...value.settings,
            screenMaskLayout: slot.settings.screenMaskLayout,
          }
        : value.settings,
    );
    slot.settings = recalled.settings;
    document.appearanceHistory = {
      ...document.appearanceHistory,
      [kind]: recalled.history,
    };
  }
  return saveOutputSlots(dir, {
    ...document,
    slots: { ...document.slots, [kind]: slot },
  });
}

function setOutputRecentColors(dir, recentColors) {
  const document = loadOutputSlots(dir);
  return saveOutputSlots(dir, {
    ...document,
    preferences: {
      ...document.preferences,
      recentColors,
    },
  });
}

function setOutputSavedColors(dir, savedColors) {
  const document = loadOutputSlots(dir);
  return saveOutputSlots(dir, {
    ...document,
    preferences: {
      ...document.preferences,
      savedColors,
    },
  });
}

function projectPublicOutputSlots(slots) {
  const projected = structuredClone(slots);
  const lyrics = projected.lyrics;
  if (!lyrics?.settings) return projected;
  const selected = activePhantomPortraitSet(
    lyrics.settings.phantomPortraitSets,
  );
  if (lyrics.templateId === 'phantom-thieves' && selected) {
    for (const key of PHANTOM_PORTRAIT_FIELDS)
      lyrics.settings[key] = selected[key];
  }
  if (
    lyrics.templateId !== 'manga-frame' ||
    lyrics.settings.mangaTailDirection === 'fixed'
  ) {
    delete lyrics.settings.mangaTailX;
    delete lyrics.settings.mangaTailY;
  }
  delete lyrics.settings.phantomPortraitSets;
  return projected;
}

function canServeOutputPortrait(lyrics, source, id) {
  const settings = lyrics?.settings ?? {};
  if (
    lyrics?.templateId !== 'phantom-thieves' ||
    (settings.phantomMode ?? OUTPUT_APPEARANCE_DEFAULTS.phantomMode) !==
      'side-card' ||
    (settings.phantomCardStyle ??
      OUTPUT_APPEARANCE_DEFAULTS.phantomCardStyle) !== 'portrait'
  ) {
    return false;
  }
  const portrait =
    activePhantomPortraitSet(settings.phantomPortraitSets) ?? settings;
  return source !== 'custom' || portrait.phantomPortraitPhoto === id;
}

module.exports = {
  canServeOutputPortrait,
  loadOutputSlots,
  OUTPUT_SLOTS_FILENAME,
  OUTPUT_SLOTS_VERSION,
  projectPublicOutputSlots,
  sanitizeOutputSlot,
  saveOutputSlots,
  setOutputRecentColors,
  setOutputSavedColors,
  upsertOutputSlot,
};
