import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deleteOutputProfile,
  loadOutputProfiles,
  OUTPUT_PROFILES_FILENAME,
  saveOutputProfiles,
  selectOutputProfile,
  upsertOutputProfile,
} from './outputProfiles.js';

describe('outputProfiles', () => {
  let dir;
  let filePath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-output-test-'));
    filePath = path.join(dir, OUTPUT_PROFILES_FILENAME);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty versioned document when overlays.json is missing', () => {
    expect(loadOutputProfiles(dir)).toEqual({
      version: 1,
      selectedProfileId: null,
      profiles: [],
    });
  });

  it('round-trips multiple machine-independent profiles atomically', () => {
    const saved = saveOutputProfiles(dir, {
      selectedProfileId: 'lyrics-main',
      profiles: [
        {
          id: 'now-main',
          name: 'Now main',
          templateId: 'now-next',
          styleSetIds: ['runtime-source'],
          settings: { density: 'compact', showArtist: true, rows: 8 },
          machinePath: 'C:\\Users\\User\\secret.css',
        },
        {
          id: 'lyrics-main',
          name: 'Lyrics main',
          templateId: 'focus-line',
          styleSetIds: ['lyrics-type', 'lyrics-type'],
          settings: {
            alignment: 'center',
            nested: { shouldNotPersist: true },
          },
        },
      ],
    });

    expect(saved).toEqual({
      version: 1,
      selectedProfileId: 'lyrics-main',
      profiles: [
        {
          id: 'now-main',
          name: 'Now main',
          templateId: 'now-next',
          styleSetIds: ['runtime-source'],
          settings: { density: 'compact', showArtist: true, rows: 8 },
        },
        {
          id: 'lyrics-main',
          name: 'Lyrics main',
          templateId: 'focus-line',
          styleSetIds: ['lyrics-type'],
          settings: { alignment: 'center' },
        },
      ],
    });
    expect(loadOutputProfiles(dir)).toEqual(saved);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(fs.readFileSync(filePath, 'utf8')).not.toContain('secret.css');
  });

  it('backs up corrupted or invalid top-level documents', () => {
    fs.writeFileSync(filePath, '{ invalid json');
    expect(loadOutputProfiles(dir).profiles).toEqual([]);
    expect(
      fs
        .readdirSync(dir)
        .filter((name) => name.startsWith('overlays.json.corrupted-')),
    ).toHaveLength(1);

    fs.writeFileSync(filePath, JSON.stringify({ profiles: 'wrong' }));
    expect(loadOutputProfiles(dir).profiles).toEqual([]);
    expect(
      fs
        .readdirSync(dir)
        .filter((name) => name.startsWith('overlays.json.corrupted-')),
    ).toHaveLength(2);
  });

  it('upserts in place, selects explicitly, and repairs selection on delete', () => {
    upsertOutputProfile(dir, {
      id: 'first',
      name: 'First',
      templateId: 'now-next',
    });
    upsertOutputProfile(dir, {
      id: 'second',
      name: 'Second',
      templateId: 'queue-board',
    });
    upsertOutputProfile(dir, {
      id: 'first',
      name: 'First renamed',
      templateId: 'focus-line',
    });
    selectOutputProfile(dir, 'second');

    expect(loadOutputProfiles(dir)).toMatchObject({
      selectedProfileId: 'second',
      profiles: [
        { id: 'first', name: 'First renamed', templateId: 'focus-line' },
        { id: 'second', name: 'Second', templateId: 'queue-board' },
      ],
    });

    deleteOutputProfile(dir, 'second');
    expect(loadOutputProfiles(dir)).toMatchObject({
      selectedProfileId: 'first',
      profiles: [{ id: 'first' }],
    });
  });

  it('drops invalid profiles and clears an unknown selected id', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        selectedProfileId: 'missing',
        profiles: [
          null,
          { id: '', name: 'No id', templateId: 'now-next' },
          { id: 'no-template', name: 'No template' },
          { id: 'valid', name: 'Valid', templateId: 'now-next' },
        ],
      }),
    );

    expect(loadOutputProfiles(dir)).toEqual({
      version: 1,
      selectedProfileId: null,
      profiles: [
        {
          id: 'valid',
          name: 'Valid',
          templateId: 'now-next',
          styleSetIds: [],
          settings: {},
        },
      ],
    });
  });

  it('refuses a newer schema version without moving or overwriting it', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ version: 2, selectedProfileId: null, entries: [] }),
    );

    expect(() => loadOutputProfiles(dir)).toThrow(/newer overlays/i);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(
      fs
        .readdirSync(dir)
        .filter((name) => name.startsWith('overlays.json.corrupted-')),
    ).toHaveLength(0);
  });
});
