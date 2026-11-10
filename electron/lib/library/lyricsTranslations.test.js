import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  deleteTranslations,
  loadTranslations,
  saveTranslations,
} from './lyricsTranslations.js';

const filename = 'fixture.lrc';
const document = {
  documentId: 'song',
  lines: [
    { lineId: 'a', text: '明日', startMs: 1000 },
    { lineId: 'b', text: '明日', startMs: 5000 },
  ],
};
const rows = {
  'zh-TW': [{ lineId: 'a', original: '明日', text: '明天' }],
  en: [{ lineId: 'b', original: '明日', text: 'Tomorrow' }],
};
let trackDir;
beforeEach(() => {
  trackDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'lyrics-translations-')),
  );
  fs.mkdirSync(path.join(trackDir, 'lyrics'));
});
afterEach(() => fs.rmSync(trackDir, { recursive: true, force: true }));

it('persists both languages and keeps repeated lyrics distinct when timing changes', () => {
  const saved = saveTranslations(trackDir, filename, document, null, rows);
  const retimed = {
    ...document,
    lines: document.lines.map((line) => ({
      ...line,
      startMs: line.startMs + 500,
    })),
  };
  expect(loadTranslations(trackDir, filename, retimed)).toEqual({
    revision: saved.revision,
    rows,
  });
  expect(loadTranslations(trackDir, 'different.lrc', retimed).rows.en).toEqual(
    [],
  );
  deleteTranslations(trackDir, filename);
  expect(loadTranslations(trackDir, filename, document).revision).toBeNull();
});

it('filters an edited original and rejects stale or unpaired writes', () => {
  const saved = saveTranslations(trackDir, filename, document, null, rows);
  const edited = {
    ...document,
    lines: [{ ...document.lines[0], text: '今夜' }, document.lines[1]],
  };
  expect(loadTranslations(trackDir, filename, edited).rows).toEqual({
    'zh-TW': [],
    en: rows.en,
  });
  expect(() =>
    saveTranslations(trackDir, filename, document, null, rows),
  ).toThrow('translation revision changed');
  expect(() =>
    saveTranslations(trackDir, filename, edited, saved.revision, rows),
  ).toThrow('invalid translation line');
  expect(loadTranslations(trackDir, filename, document)).toEqual(saved);
});
