import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  loadOutputSlots,
  OUTPUT_SLOTS_FILENAME,
  saveOutputSlots,
  setOutputRecentColors,
  setOutputSavedColors,
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

  it('replaces retired saved templates and rejects selecting them again', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 4,
        slots: {
          lyrics: { templateId: 'focus-line', settings: {} },
          'now-playing': { templateId: 'now-next', settings: {} },
        },
      }),
    );
    const loaded = loadOutputSlots(dir);
    expect(loaded.slots.lyrics.templateId).toBe('karaoke-stack');
    expect(loaded.slots['now-playing'].templateId).toBe('art-card');
    for (const [kind, templateId] of [
      ['lyrics', 'focus-line'],
      ['now-playing', 'now-next'],
    ]) {
      expect(() =>
        upsertOutputSlot(dir, kind, { templateId, settings: {} }),
      ).toThrow();
    }
  });

  it('returns an empty v4 document when overlays.json is missing', () => {
    const document = loadOutputSlots(dir);
    expect(document.version).toBe(4);
    expect(document.preferences).toEqual({
      recentColors: [],
      savedColors: [],
    });
    expect(Object.keys(document.slots)).toEqual([
      'lyrics',
      'setlist',
      'now-playing',
    ]);
    expect(document.slots.lyrics.templateId).toBe('karaoke-stack');
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
          templateId: 'art-card',
          styleSetIds: ['runtime-source'],
          settings: { alignment: 'left', showArtist: true },
          machinePath: 'C:\\Users\\User\\secret.css',
        },
        lyrics: {
          templateId: 'karaoke-stack',
          styleSetIds: ['lyrics-type', 'lyrics-type'],
          settings: {
            fontFamily: 'serif',
            nested: { shouldNotPersist: true },
          },
        },
      },
    });

    expect(saved).toMatchObject({
      version: 4,
      preferences: { recentColors: [], savedColors: [] },
      slots: {
        'now-playing': {
          templateId: 'art-card',
          styleSetIds: ['runtime-source'],
          settings: { alignment: 'left', showArtist: true },
        },
        lyrics: {
          templateId: 'karaoke-stack',
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
          { id: 'now-main', templateId: 'art-card', settings: {} },
          { id: 'lyrics-main', templateId: 'karaoke-stack', settings: {} },
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
      version: 4,
      preferences: { recentColors: [], savedColors: [] },
      slots: {
        'now-playing': {
          templateId: 'art-card',
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
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).version).toBe(4);
  });

  it('migrates v2 slots to v4 preferences without losing slot settings', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 2,
        slots: {
          lyrics: {
            templateId: 'ornate-vertical',
            settings: { textColor: '#ABCDEF', captureSize: 'full' },
          },
        },
      }),
    );

    expect(loadOutputSlots(dir)).toMatchObject({
      version: 4,
      preferences: { recentColors: [], savedColors: [] },
      slots: {
        lyrics: {
          templateId: 'ornate-vertical',
          settings: { textColor: '#abcdef', captureSize: 'full' },
        },
      },
    });
    expect(
      fs
        .readdirSync(dir)
        .some((name) => /^overlays\.json\.v2-.*\.bak$/.test(name)),
    ).toBe(true);
  });

  it('moves untouched v3 Manga fonts to the GenEi Antique default', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 3,
        slots: {
          lyrics: {
            templateId: 'manga-frame',
            settings: { fontFamily: 'serif', captureSize: 'full' },
          },
          'now-playing': {
            templateId: 'art-card',
            settings: { fontFamily: 'serif', captureSize: 'small' },
          },
        },
      }),
    );

    const document = loadOutputSlots(dir);
    expect(document.version).toBe(4);
    expect(document.slots.lyrics.settings.fontFamily).toBe('antique');
    expect(document.slots['now-playing'].settings.fontFamily).toBe('serif');
    expect(
      fs
        .readdirSync(dir)
        .some((name) => /^overlays\.json\.v3-.*\.bak$/.test(name)),
    ).toBe(true);
  });

  it('keeps v3 Manga fonts the user chose', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 3,
        slots: {
          lyrics: {
            templateId: 'manga-frame',
            settings: { fontFamily: 'rounded', captureSize: 'full' },
          },
        },
      }),
    );

    expect(loadOutputSlots(dir).slots.lyrics.settings.fontFamily).toBe(
      'rounded',
    );
  });

  it('upserts only the addressed kind and rejects cross-kind templates', () => {
    setOutputRecentColors(dir, ['#112233']);
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'karaoke-stack',
      settings: { alignment: 'center' },
    });
    upsertOutputSlot(dir, 'now-playing', {
      templateId: 'art-card',
      settings: { alignment: 'left' },
    });
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'karaoke-stack',
      settings: { alignment: 'right' },
    });

    expect(loadOutputSlots(dir).slots).toMatchObject({
      'now-playing': {
        templateId: 'art-card',
        settings: { alignment: 'left' },
      },
      lyrics: {
        templateId: 'karaoke-stack',
        settings: { alignment: 'right' },
      },
    });
    expect(loadOutputSlots(dir).preferences.recentColors).toEqual(['#112233']);
    expect(() =>
      upsertOutputSlot(dir, 'lyrics', { templateId: 'queue-board' }),
    ).toThrow('Invalid output slot');
  });

  it('persists only a bounded normalized recent-color preference list', () => {
    const saved = setOutputRecentColors(dir, [
      '#AABBCC',
      '#aabbcc',
      '#112233',
      'url(private)',
      '#445566',
    ]);

    expect(saved.preferences.recentColors).toEqual([
      '#aabbcc',
      '#112233',
      '#445566',
    ]);
    expect(loadOutputSlots(dir)).toEqual(saved);
    expect(saved.slots.lyrics.templateId).toBe('karaoke-stack');
  });

  it('persists a bounded saved palette without changing recent colors or slots', () => {
    setOutputRecentColors(dir, ['#112233']);

    const saved = setOutputSavedColors(dir, [
      '#AABBCC',
      '#aabbcc',
      '#445566',
      'url(private)',
    ]);

    expect(saved.preferences).toEqual({
      recentColors: ['#112233'],
      savedColors: ['#aabbcc', '#445566'],
    });
    expect(loadOutputSlots(dir)).toEqual(saved);
    expect(saved.slots.lyrics.templateId).toBe('karaoke-stack');
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
        templateId: 'karaoke-stack',
        settings: {},
      }),
    ).not.toThrow();
    expect(() =>
      upsertOutputSlot(dir, 'lyrics', {
        templateId: 'live-stage',
        settings: { captureSize: 'full' },
      }),
    ).not.toThrow();
    expect(() =>
      upsertOutputSlot(dir, 'lyrics', {
        templateId: 'ornate-vertical',
        settings: { captureSize: 'full' },
      }),
    ).not.toThrow();
  });

  it('persists a bounded local font only for the Live Stage capability', () => {
    const localFont = {
      source: 'local',
      family: 'Noto Sans CJK TC',
      postscriptName: 'NotoSansCJKtc-Regular',
      style: 'Regular',
    };
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'live-stage',
      settings: { fontFamily: localFont, captureSize: 'full' },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings.fontFamily).toEqual(
      localFont,
    );

    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'karaoke-stack',
      settings: { fontFamily: localFont, captureSize: 'full' },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).not.toHaveProperty(
      'fontFamily',
    );
  });

  it('bounds the independent Live Stage presentation policy setting', () => {
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'live-stage',
      settings: {
        lyricsPresentationPolicyId: 'balanced',
        captureSize: 'full',
      },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).toMatchObject({
      lyricsPresentationPolicyId: 'balanced',
      captureSize: 'full',
    });

    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'live-stage',
      settings: {
        lyricsPresentationPolicyId: 'not-a-policy',
        captureSize: 'full',
      },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).not.toHaveProperty(
      'lyricsPresentationPolicyId',
    );

    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'karaoke-stack',
      settings: {
        lyricsPresentationPolicyId: 'literal',
        captureSize: 'full',
      },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).not.toHaveProperty(
      'lyricsPresentationPolicyId',
    );
  });

  it('persists the Kinetic Pop material selection', () => {
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'kinetic-pop',
      settings: {
        kineticMaterial: 'cycle',
        captureSize: 'full',
      },
    });

    expect(loadOutputSlots(dir).slots.lyrics).toEqual({
      templateId: 'kinetic-pop',
      styleSetIds: [],
      settings: {
        kineticMaterial: 'cycle',
        captureSize: 'full',
      },
    });
  });

  it('validates and bounds recognized appearance settings at persistence', () => {
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'ornate-vertical',
      settings: {
        fontFamily: 'ornate',
        fontScale: 'large',
        textColor: '#FFF8EC',
        accentColor: 'red; inset: 0',
        positionAnchor: 'bottom-right',
        positionOffsetX: 100,
        positionOffsetY: -100,
        showArtist: true,
        captureSize: 'full',
      },
    });

    expect(loadOutputSlots(dir).slots.lyrics.settings).toEqual({
      fontFamily: 'ornate',
      fontScale: 'large',
      textColor: '#fff8ec',
      positionAnchor: 'bottom-right',
      positionOffsetX: 12,
      positionOffsetY: -25,
      showArtist: true,
      captureSize: 'full',
    });
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
      templateId: 'art-card',
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
      templateId: 'karaoke-stack',
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
    expect(loadOutputSlots(dir).slots.lyrics.templateId).toBe('karaoke-stack');
    expect(
      fs
        .readdirSync(dir)
        .filter((name) => name.startsWith('overlays.json.corrupted-')),
    ).toHaveLength(1);

    fs.writeFileSync(filePath, JSON.stringify({ version: 5, slots: {} }));
    expect(() => loadOutputSlots(dir)).toThrow(/newer overlays/i);
  });
});
