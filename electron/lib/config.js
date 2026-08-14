'use strict';

const fs = require('fs');
const { atomicWriteJson } = require('./atomicWrite');
const { normalizeFeatureConfirmations } = require('./featureGates');

const CURRENT_VERSION = 1;
const DEFAULTS = {
  version: CURRENT_VERSION,
  downloadDir: null,
  featureConfirmations: {},
};

function backupCorrupted(configPath) {
  const backupPath = `${configPath}.corrupted-${Date.now()}`;
  try {
    fs.renameSync(configPath, backupPath);
  } catch {
    // best-effort — if even the rename fails, just fall through to defaults
  }
}

// Tolerant load: missing file, corrupted JSON, and wrong-typed fields all
// degrade to defaults rather than throwing — this is machine-local settings
// that can be hand-edited or clobbered by a sync tool, not exceptional input.
function loadConfig(configPath) {
  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch {
    return { ...DEFAULTS };
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    backupCorrupted(configPath);
    return { ...DEFAULTS };
  }

  if (typeof data !== 'object' || data === null) {
    backupCorrupted(configPath);
    return { ...DEFAULTS };
  }

  return {
    version: CURRENT_VERSION,
    downloadDir:
      typeof data.downloadDir === 'string'
        ? data.downloadDir
        : DEFAULTS.downloadDir,
    featureConfirmations: normalizeFeatureConfirmations(
      data.featureConfirmations,
    ),
  };
}

function saveConfig(configPath, partial) {
  const merged = {
    ...loadConfig(configPath),
    ...partial,
    version: CURRENT_VERSION,
  };
  atomicWriteJson(configPath, merged);
  return merged;
}

module.exports = { loadConfig, saveConfig, DEFAULTS };
