import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadOutputSlots,
  OUTPUT_SLOTS_FILENAME,
  saveOutputSlots,
  upsertOutputSlot,
} from './outputSlots.js';

describe('outputSlots', () => {
  let dir;
  let filePath;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-output-test-'));
    filePath = path.join(dir, OUTPUT_SLOTS_FILENAME);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty v2 document when overlays.json is missing', () => {
    const document = loadOutputSlots(dir);
    expect(document.version).toBe(2);
    expect(Object.keys(document.slots)).toEqual([
      'now-playing',
      'setlist',
      'lyrics',
      'artwork',
    ]);
    expect(document.slots.lyrics.templateId).toBe('focus-line');
  });

  it('round-trips independent machine-safe slots atomically', () => {
    const saved = saveOutputSlots(dir, {
      slots: {
        'now-playing': {
          templateId: 'now-next',
          styleSetIds: ['runtime-source'],
          settings: { alignment: 'left', showArtist: true },
          machinePath: 'C:\\Users\\User\\secret.css',
        },
        lyrics: {
          templateId: 'focus-line',
          styleSetIds: ['lyrics-type', 'lyrics-type'],
          settings: {
            fontFamily: 'serif',
            nested: { shouldNotPersist: true },
          },
        },
      },
    });

    expect(saved).toMatchObject({
      version: 2,
      slots: {
        'now-playing': {
          templateId: 'now-next',
          styleSetIds: ['runtime-source'],
          settings: { alignment: 'left', showArtist: true },
        },
        lyrics: {
          templateId: 'focus-line',
          styleSetIds: ['lyrics-type'],
          settings: { fontFamily: 'serif' },
        },
      },
    });
    expect(loadOutputSlots(dir)).toEqual(saved);
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(fs.readFileSync(filePath, 'utf8')).not.toContain('secret.css');
  });

  it('migrates one selected profile per kind without making kinds exclusive', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 1,
        selectedProfileId: 'lyrics-alt',
        profiles: [
          { id: 'now-main', templateId: 'now-next', settings: {} },
          { id: 'lyrics-main', templateId: 'focus-line', settings: {} },
          {
            id: 'lyrics-alt',
            templateId: 'karaoke-stack',
            settings: { fontScale: 'large' },
          },
          { id: 'setlist-main', templateId: 'queue-board', settings: {} },
        ],
      }),
    );

    expect(loadOutputSlots(dir)).toMatchObject({
      version: 2,
      slots: {
        'now-playing': {
          templateId: 'now-next',
          styleSetIds: [],
          settings: {},
        },
        setlist: {
          templateId: 'queue-board',
          styleSetIds: [],
          settings: {},
        },
        lyrics: {
          templateId: 'karaoke-stack',
          styleSetIds: [],
          settings: { fontScale: 'large' },
        },
      },
    });
    expect(
      fs
        .readdirSync(dir)
        .some((name) => /^overlays\.json\.v1-.*\.bak$/.test(name)),
    ).toBe(true);
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).version).toBe(2);
  });

  it('upserts only the addressed kind and rejects cross-kind templates', () => {
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'focus-line',
      settings: { alignment: 'center' },
    });
    upsertOutputSlot(dir, 'now-playing', {
      templateId: 'now-next',
      settings: { alignment: 'left' },
    });
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'karaoke-stack',
      settings: { alignment: 'right' },
    });

    expect(loadOutputSlots(dir).slots).toMatchObject({
      'now-playing': {
        templateId: 'now-next',
        settings: { alignment: 'left' },
      },
      lyrics: {
        templateId: 'karaoke-stack',
        settings: { alignment: 'right' },
      },
    });
    expect(() =>
      upsertOutputSlot(dir, 'lyrics', { templateId: 'queue-board' }),
    ).toThrow('Invalid output slot');
  });

  it('backs up corrupted documents and refuses newer versions', () => {
    fs.writeFileSync(filePath, '{ invalid json');
    expect(loadOutputSlots(dir).slots.lyrics.templateId).toBe('focus-line');
    expect(
      fs
        .readdirSync(dir)
        .filter((name) => name.startsWith('overlays.json.corrupted-')),
    ).toHaveLength(1);

    fs.writeFileSync(filePath, JSON.stringify({ version: 3, slots: {} }));
    expect(() => loadOutputSlots(dir)).toThrow(/newer overlays/i);
  });
});
