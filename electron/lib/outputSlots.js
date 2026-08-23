'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson, backupCorrupted } = require('./atomicWrite');
const OUTPUT_APPEARANCE_VALUES = require('../../shared/outputAppearanceValues.json');
const OUTPUT_TEMPLATE_VALUES = require('../../shared/outputTemplateValues.json');

const OUTPUT_SLOTS_FILENAME = 'overlays.json';
const OUTPUT_SLOTS_VERSION = 2;
const MAX_STYLE_SET_IDS = 32;
const MAX_SETTINGS = 100;
const MAX_ID_LENGTH = 100;
const MAX_SETTING_STRING_LENGTH = 1000;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_SETTING_KEY_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;
const SLOT_IDS = new Set(OUTPUT_TEMPLATE_VALUES.slots.map((slot) => slot.id));
const TEMPLATE_KINDS = OUTPUT_TEMPLATE_VALUES.templateKinds;

function emptyDocument() {
  return normalizeDocument({ slots: {} });
}

function safeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, MAX_ID_LENGTH);
  return SAFE_ID_RE.test(trimmed) ? trimmed : null;
}

function sanitizeSettings(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  const entries = [];
  for (const [key, setting] of Object.entries(value)) {
    if (entries.length >= MAX_SETTINGS) break;
    if (!SAFE_SETTING_KEY_RE.test(key) || key.length > MAX_ID_LENGTH) continue;
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

  const templateId = safeId(value.templateId);
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

  return {
    templateId,
    styleSetIds,
    settings: sanitizeSettings(value.settings),
  };
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
        settings:
          OUTPUT_APPEARANCE_VALUES.slotDefaultSettings[slot.id] ??
          OUTPUT_APPEARANCE_VALUES.defaultSettings,
      });
    slots[slot.id] = normalized;
  }
  return { version: OUTPUT_SLOTS_VERSION, slots };
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
  return normalizeDocument({ slots });
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
  return saveOutputSlots(dir, {
    slots: { ...document.slots, [kind]: slot },
  });
}

module.exports = {
  loadOutputSlots,
  OUTPUT_SLOTS_FILENAME,
  OUTPUT_SLOTS_VERSION,
  sanitizeOutputSlot,
  saveOutputSlots,
  upsertOutputSlot,
};
