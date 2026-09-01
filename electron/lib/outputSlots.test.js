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
      'setlist',
      'lyrics',
      'now-playing',
    ]);
    expect(document.slots.lyrics.templateId).toBe('focus-line');
    expect(document.slots).toMatchObject({
      'now-playing': { settings: { captureSize: 'small' } },
      setlist: { settings: { captureSize: 'large' } },
      lyrics: { settings: { captureSize: 'full' } },
    });
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

  it('round-trips bundled Lyrics template ids with appearance settings', () => {
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'manga-frame',
      styleSetIds: ['runtime-source', 'lyrics-type'],
      settings: {
        fontFamily: 'serif',
        fontScale: 'large',
        alignment: 'left',
        surface: 'solid',
        captureSize: 'full',
      },
    });

    expect(loadOutputSlots(dir).slots.lyrics).toEqual({
      templateId: 'manga-frame',
      styleSetIds: ['runtime-source', 'lyrics-type'],
      settings: {
        fontFamily: 'serif',
        fontScale: 'large',
        alignment: 'left',
        surface: 'solid',
        captureSize: 'full',
      },
    });

    expect(() =>
      upsertOutputSlot(dir, 'lyrics', {
        templateId: 'quiet-caption',
        settings: {},
      }),
    ).not.toThrow();
    expect(() =>
      upsertOutputSlot(dir, 'lyrics', {
        templateId: 'live-stage',
        settings: { captureSize: 'full' },
      }),
    ).not.toThrow();
  });

  it('round-trips the bundled Cover Player Now Playing template id', () => {
    upsertOutputSlot(dir, 'now-playing', {
      templateId: 'cover-player',
      styleSetIds: ['runtime-source'],
      settings: { surface: 'soft', alignment: 'left' },
    });

    expect(loadOutputSlots(dir).slots['now-playing']).toEqual({
      templateId: 'cover-player',
      styleSetIds: ['runtime-source'],
      settings: {
        surface: 'soft',
        alignment: 'left',
        captureSize: 'medium',
      },
    });
  });

  it('persists widget capture sizes and normalizes invalid or Lyrics values', () => {
    upsertOutputSlot(dir, 'now-playing', {
      templateId: 'now-next',
      settings: { captureSize: 'medium' },
    });
    upsertOutputSlot(dir, 'now-playing', {
      templateId: 'art-card',
      settings: { captureSize: 'large' },
    });
    upsertOutputSlot(dir, 'setlist', {
      templateId: 'queue-board',
      settings: { captureSize: 'medium' },
    });
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'focus-line',
      settings: { captureSize: 'small' },
    });

    expect(loadOutputSlots(dir).slots).toMatchObject({
      'now-playing': { settings: { captureSize: 'small' } },
      setlist: { settings: { captureSize: 'large' } },
      lyrics: { settings: { captureSize: 'full' } },
    });
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
