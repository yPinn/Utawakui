import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { readSettings, writeSettings, record } from './store.js';
import { PERFORMANCE_SETTINGS_DEFAULTS } from '../../../shared/performanceSettings.mjs';
let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'performance-store-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
it('round-trips a complete document and a tombstone, preserving absence', () => {
  expect(readSettings(dir)).toEqual({ raw: null, document: null });
  const binding = { kind: 'audio-content-sha256', value: 'a'.repeat(64) };
  const saved = writeSettings(
    dir,
    binding,
    [PERFORMANCE_SETTINGS_DEFAULTS, null, null],
    1,
  );
  expect(saved.document).toMatchObject({
    binding,
    slots: [PERFORMANCE_SETTINGS_DEFAULTS, null, null],
  });
  expect(
    writeSettings(dir, binding, [null, null, null], 1).document.slots,
  ).toEqual([null, null, null]);
});
it('maps early single-slot data in memory without rewriting its bytes', () => {
  const raw = JSON.stringify({
    version: 1,
    revision: randomUUID(),
    binding: { kind: 'audio-content-sha256', value: 'a'.repeat(64) },
    values: PERFORMANCE_SETTINGS_DEFAULTS,
  });
  const file = path.join(dir, 'performance-settings.json');
  fs.writeFileSync(file, raw);
  expect(readSettings(dir).document).toMatchObject({
    slots: [PERFORMANCE_SETTINGS_DEFAULTS, null, null],
    defaultSlot: 1,
  });
  expect(fs.readFileSync(file, 'utf8')).toBe(raw);
});
it.each([
  '{',
  JSON.stringify({ version: 1 }),
  JSON.stringify({ version: 2 }),
  ' '.repeat(4097),
])('retains rejected bytes %j', (raw) => {
  const file = path.join(dir, 'performance-settings.json');
  fs.writeFileSync(file, raw);
  expect(() => readSettings(dir)).toThrow();
  expect(fs.readFileSync(file, 'utf8')).toBe(raw);
});
it.each([null, [], new Date(), { unknown: 1 }])(
  'rejects malformed intent records %j',
  (input) => {
    expect(() => record(input, ['trackId'])).toThrow();
  },
);
