'use strict';

const fs = require('fs');
const path = require('path');
const { atomicWriteJson, backupCorrupted } = require('./atomicWrite');

const OUTPUT_PROFILES_FILENAME = 'overlays.json';
const OUTPUT_PROFILES_VERSION = 1;
const MAX_OUTPUT_PROFILES = 100;
const MAX_STYLE_SET_IDS = 32;
const MAX_SETTINGS = 100;
const MAX_ID_LENGTH = 100;
const MAX_NAME_LENGTH = 200;
const MAX_SETTING_STRING_LENGTH = 1000;
const SAFE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_SETTING_KEY_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;

function emptyDocument() {
  return {
    version: OUTPUT_PROFILES_VERSION,
    selectedProfileId: null,
    profiles: [],
  };
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

function sanitizeOutputProfile(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const id = safeId(value.id);
  const templateId = safeId(value.templateId);
  if (!id || !templateId) return null;

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

  const rawName = typeof value.name === 'string' ? value.name.trim() : '';
  return {
    id,
    name: (rawName || id).slice(0, MAX_NAME_LENGTH),
    templateId,
    styleSetIds,
    settings: sanitizeSettings(value.settings),
  };
}

function normalizeDocument(value) {
  const profiles = [];
  const seenIds = new Set();
  for (const rawProfile of value.profiles) {
    if (profiles.length >= MAX_OUTPUT_PROFILES) break;
    const profile = sanitizeOutputProfile(rawProfile);
    if (!profile || seenIds.has(profile.id)) continue;
    seenIds.add(profile.id);
    profiles.push(profile);
  }
  const selectedProfileId = safeId(value.selectedProfileId);
  return {
    version: OUTPUT_PROFILES_VERSION,
    selectedProfileId: profiles.some(
      (profile) => profile.id === selectedProfileId,
    )
      ? selectedProfileId
      : null,
    profiles,
  };
}

function loadOutputProfiles(dir) {
  const filePath = path.join(dir, OUTPUT_PROFILES_FILENAME);
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
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
    data.version > OUTPUT_PROFILES_VERSION
  ) {
    throw new Error(
      `Cannot load newer overlays.json version ${data.version}; supported version is ${OUTPUT_PROFILES_VERSION}`,
    );
  }
  if (!Array.isArray(data.profiles)) {
    backupCorrupted(filePath);
    return emptyDocument();
  }

  return normalizeDocument(data);
}

function writeOutputProfiles(dir, document) {
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteJson(path.join(dir, OUTPUT_PROFILES_FILENAME), document);
}

function saveOutputProfiles(dir, value = {}) {
  const document = normalizeDocument({
    selectedProfileId: value.selectedProfileId,
    profiles: Array.isArray(value.profiles) ? value.profiles : [],
  });
  writeOutputProfiles(dir, document);
  return document;
}

function upsertOutputProfile(dir, value) {
  const profile = sanitizeOutputProfile(value);
  if (!profile) throw new TypeError('Invalid output profile');

  const document = loadOutputProfiles(dir);
  const index = document.profiles.findIndex((item) => item.id === profile.id);
  const profiles = [...document.profiles];
  if (index === -1) {
    profiles.push(profile);
  } else {
    profiles[index] = profile;
  }
  return saveOutputProfiles(dir, { ...document, profiles });
}

function selectOutputProfile(dir, profileId) {
  const document = loadOutputProfiles(dir);
  const id = safeId(profileId);
  if (!id || !document.profiles.some((profile) => profile.id === id)) {
    return document;
  }
  return saveOutputProfiles(dir, { ...document, selectedProfileId: id });
}

function deleteOutputProfile(dir, profileId) {
  const document = loadOutputProfiles(dir);
  const profiles = document.profiles.filter(
    (profile) => profile.id !== profileId,
  );
  if (profiles.length === document.profiles.length) return document;
  const selectedProfileId =
    document.selectedProfileId === profileId
      ? (profiles[0]?.id ?? null)
      : document.selectedProfileId;
  return saveOutputProfiles(dir, { selectedProfileId, profiles });
}

module.exports = {
  deleteOutputProfile,
  loadOutputProfiles,
  OUTPUT_PROFILES_FILENAME,
  OUTPUT_PROFILES_VERSION,
  saveOutputProfiles,
  selectOutputProfile,
  sanitizeOutputProfile,
  upsertOutputProfile,
};
