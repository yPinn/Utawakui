'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWriteJson } = require('../atomicWrite');
const { validateTrackBinding } = require('../works/trackBinding');
const {
  validPerformanceSettings,
} = require('../../../shared/performanceSettings.mjs');

const FILENAME = 'performance-settings.json';
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function failure(code = 'PERFORMANCE_INVALID') {
  return Object.assign(new Error('Performance settings operation failed'), {
    code,
  });
}
function record(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => !fields.includes(key))
  )
    throw failure();
}
function readSettings(directory) {
  let raw;
  try {
    const file = path.join(directory, FILENAME);
    if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 4096)
      throw failure('PERFORMANCE_INVALID_DATA');
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { raw: null, document: null };
    throw error;
  }
  let document;
  try {
    document = JSON.parse(raw);
    if (Number.isSafeInteger(document?.version) && document.version > 2)
      throw failure('PERFORMANCE_UNSUPPORTED');
    const legacy = document?.version === 1;
    record(
      document,
      legacy
        ? ['version', 'revision', 'binding', 'values']
        : ['version', 'revision', 'binding', 'slots', 'defaultSlot'],
    );
    if (legacy)
      document = {
        version: 2,
        revision: document.revision,
        binding: document.binding,
        slots: [document.values, null, null],
        defaultSlot: 1,
      };
    if (
      document.version !== 2 ||
      !uuid.test(document.revision) ||
      !Array.isArray(document.slots) ||
      document.slots.length !== 3 ||
      document.slots.some(
        (value) => value !== null && !validPerformanceSettings(value),
      ) ||
      !Number.isInteger(document.defaultSlot) ||
      document.defaultSlot < 1 ||
      document.defaultSlot > 3 ||
      (document.slots.some(Boolean) &&
        !document.slots[document.defaultSlot - 1])
    )
      throw failure();
    validateTrackBinding(document.binding);
  } catch (error) {
    if (error.code === 'PERFORMANCE_UNSUPPORTED') throw error;
    throw failure('PERFORMANCE_INVALID_DATA');
  }
  return { raw, document };
}
function writeSettings(directory, binding, slots, defaultSlot) {
  const document = {
    version: 2,
    revision: randomUUID(),
    binding,
    slots,
    defaultSlot,
  };
  atomicWriteJson(path.join(directory, FILENAME), document);
  return readSettings(directory);
}
module.exports = { readSettings, writeSettings, failure, record };
