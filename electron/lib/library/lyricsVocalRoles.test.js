import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import roles from './lyricsVocalRoles.js';
import { loadTrackLyricsTiming } from './lyricsTiming.js';
import { normalizeLyricsDocument } from '../../../src/utils/lyricsDocument.js';
let dir, doc;
const filename = 'main.lrc';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-roles-'));
  fs.mkdirSync(path.join(dir, 'lyrics'));
  fs.writeFileSync(
    path.join(dir, 'lyrics', filename),
    '[00:01](Sabrina 胡恂舞)\n[00:03]唱下去',
  );
  doc = normalizeLyricsDocument({
    text: fs.readFileSync(path.join(dir, 'lyrics', filename), 'utf8'),
    source: { filename },
    timing: loadTrackLyricsTiming(dir, filename),
    sourceFingerprint: loadTrackLyricsTiming(dir, filename).sourceFingerprint,
  });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
describe('source-bound persisted vocal roles', () => {
  it('saves and reloads a section and per-line role without changing source or time', () => {
    const before = fs.readFileSync(path.join(dir, 'lyrics', filename));
    const assignments = [
      { lineId: doc.lines[0].lineId, role: 'female', scope: 'section' },
      { lineId: doc.lines[1].lineId, role: 'group', scope: 'line' },
    ];
    expect(
      roles.loadTrackVocalRoles(dir, filename, doc.documentId).status,
    ).toBe('missing');
    expect(
      roles.saveTrackVocalRoles(dir, filename, doc.documentId, 0, assignments),
    ).toMatchObject({ revision: 1, assignments });
    expect(
      roles.loadTrackVocalRoles(dir, filename, doc.documentId),
    ).toMatchObject({ revision: 1, assignments });
    expect(fs.readFileSync(path.join(dir, 'lyrics', filename))).toEqual(before);
    expect(() =>
      roles.saveTrackVocalRoles(dir, filename, doc.documentId, 0, []),
    ).toThrow(/reload/);
    expect(
      roles.saveTrackVocalRoles(dir, filename, doc.documentId, 1, [])
        .assignments,
    ).toEqual([]);
    expect(roles.deleteTrackVocalRoles(dir, filename)).toBe(true);
    expect(
      roles.loadTrackVocalRoles(dir, filename, doc.documentId).status,
    ).toBe('missing');
  });
  it.each(['../main.lrc', 'C:/main.lrc', 'main.lrc/other'])(
    'rejects unsafe source %s',
    (name) =>
      expect(() =>
        roles.loadTrackVocalRoles(dir, name, doc.documentId),
      ).toThrow(),
  );
  it.each([
    { role: 'other', scope: 'line' },
    { role: 'male', scope: 'all' },
    { role: 'male', scope: 'line', path: 'anything' },
  ])('rejects invalid assignment %j', (entry) =>
    expect(() =>
      roles.saveTrackVocalRoles(dir, filename, doc.documentId, 0, [
        { lineId: doc.lines[0].lineId, ...entry },
      ]),
    ).toThrow(),
  );
  it('rejects source changes, corrupt files and foreign lines', () => {
    expect(() =>
      roles.saveTrackVocalRoles(dir, filename, doc.documentId, 0, [
        { lineId: 'foreign', role: 'male', scope: 'line' },
      ]),
    ).toThrow();
    roles.saveTrackVocalRoles(dir, filename, doc.documentId, 0, []);
    fs.writeFileSync(roles.vocalRolesPath(dir, filename), 'broken');
    expect(() =>
      roles.loadTrackVocalRoles(dir, filename, doc.documentId),
    ).toThrow();
    fs.writeFileSync(path.join(dir, 'lyrics', filename), 'changed');
    expect(() =>
      roles.saveTrackVocalRoles(dir, filename, doc.documentId, 0, []),
    ).toThrow(/changed/);
  });
});
