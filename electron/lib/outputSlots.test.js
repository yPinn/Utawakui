import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOutputServer } from './outputServer.js';
import {
  loadOutputSlots,
  OUTPUT_SLOTS_FILENAME,
  projectPublicOutputSlots,
  saveOutputSlots,
  setOutputRecentColors,
  setOutputSavedColors,
  upsertOutputSlot,
} from './outputSlots.js';

// Keep real atomic-rename tests out of the sandbox's restricted TEMP.
const testTmpRoot = fileURLToPath(new URL('../../.tmp/', import.meta.url));

describe('outputSlots', () => {
  let dir;
  let filePath;

  beforeEach(() => {
    fs.mkdirSync(testTmpRoot, { recursive: true });
    dir = fs.mkdtempSync(path.join(testTmpRoot, 'utawakui-output-test-'));
    filePath = path.join(dir, OUTPUT_SLOTS_FILENAME);
  });

  afterEach(() => {
    expect(path.dirname(dir)).toBe(path.resolve(testTmpRoot));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists and publishes bounded translation sizing for the lyrics slot', () => {
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'karaoke-stack',
      settings: { translationFontScale: 138, fontScale: 'small' },
    });
    upsertOutputSlot(dir, 'setlist', {
      templateId: 'receipt-setlist',
      settings: { translationFontScale: 135 },
    });

    const { slots } = loadOutputSlots(dir);
    expect(slots.lyrics.settings).toMatchObject({
      translationFontScale: 140,
      fontScale: 'small',
    });
    expect(slots.setlist.settings).not.toHaveProperty('translationFontScale');
    expect(projectPublicOutputSlots(slots).lyrics.settings).toHaveProperty(
      'translationFontScale',
      140,
    );
  });

  it('publishes the manga placement center only while following the performer', () => {
    const save = (settings) =>
      upsertOutputSlot(dir, 'lyrics', {
        templateId: 'manga-frame',
        settings,
      });
    save({
      mangaBubbleStyle: 'thought',
      mangaTailDirection: 'performer',
      mangaTailX: 0.35,
      mangaTailY: 0.62,
    });
    const publicSettings = () =>
      projectPublicOutputSlots(loadOutputSlots(dir).slots).lyrics.settings;
    expect(publicSettings()).toMatchObject({
      mangaBubbleStyle: 'thought',
      mangaTailDirection: 'performer',
      mangaTailX: 0.35,
      mangaTailY: 0.62,
    });
    save({ mangaTailDirection: 'fixed', mangaTailX: 0.35, mangaTailY: 2 });
    expect(publicSettings()).not.toHaveProperty('mangaTailX');
    expect(loadOutputSlots(dir).slots.lyrics.settings).not.toHaveProperty(
      'mangaTailY',
    );
    save({ mangaTailDirection: 'default', mangaTailX: 0.4, mangaTailY: 0.7 });
    expect(publicSettings()).toMatchObject({
      mangaTailDirection: 'performer',
      mangaTailX: 0.4,
      mangaTailY: 0.7,
    });
  });

  it('carries shared appearance through unsupported fields and recalls each template on disk', () => {
    const switchTo = (templateId) =>
      upsertOutputSlot(dir, 'lyrics', {
        templateId,
        settings: {},
        recallAppearance: true,
      }).slots.lyrics.settings;
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'manga-frame',
      settings: {
        paletteId: 'cool-film',
        lookAmount: 0,
        filmGrainAmount: 25,
        filmGrainSize: 'large',
        fontScale: 'small',
        fontScaleAdjustment: 72,
        fontWeight: 'regular',
        mangaBubbleStyle: 'thought',
        mangaTailDirection: 'performer',
        mangaTailX: 0.4,
        mangaTailY: 0.6,
        translationFontScale: 120,
      },
    });

    const centered = switchTo('centered-vertical');
    expect(centered).toMatchObject({
      paletteId: 'cool-film',
      lookAmount: 0,
      filmGrainAmount: 25,
      fontScale: 'small',
      translationFontScale: 120,
    });
    expect(centered).not.toHaveProperty('mangaBubbleStyle');
    expect(centered).not.toHaveProperty('fontWeight');
    expect(centered).not.toHaveProperty('fontScaleAdjustment');
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'centered-vertical',
      settings: {
        ...centered,
        textColor: '#112233',
        fontFamily: 'lyrics-auto',
      },
    });
    expect(switchTo('karaoke-stack')).not.toHaveProperty('textColor');
    setOutputSavedColors(dir, ['#223344']);

    expect(switchTo('manga-frame')).toMatchObject({
      fontScale: 'small',
      fontScaleAdjustment: 80,
      fontWeight: 'regular',
      mangaBubbleStyle: 'thought',
      mangaTailX: 0.4,
      mangaTailY: 0.6,
    });
    expect(switchTo('centered-vertical')).toMatchObject({
      textColor: '#112233',
    });
    expect(loadOutputSlots(dir).slots.setlist.settings.paletteId).toBe(
      'original',
    );
  });

  it('recalls a bundled Hangul choice across templates of the same output', () => {
    const initialSetlistFont =
      loadOutputSlots(dir).slots.setlist.settings.fontFamily;
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'karaoke-stack',
      settings: { fontFamily: 'jua' },
    });
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'ornate-vertical',
      settings: {},
      recallAppearance: true,
    });

    const { slots } = loadOutputSlots(dir);
    expect(slots.lyrics.settings.fontFamily).toBe('jua');
    expect(slots.setlist.settings.fontFamily).toBe(initialSetlistFont);
  });

  it('recalls and publishes Chalkboard guide visibility with its saved color', () => {
    const guide = { chalkboardRule: 'hidden', chalkboardRuleColor: '#aabbcc' };
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'chalkboard-vertical',
      settings: guide,
    });
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'centered-vertical',
      settings: {},
      recallAppearance: true,
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).not.toHaveProperty(
      'chalkboardRule',
    );
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'chalkboard-vertical',
      settings: {},
      recallAppearance: true,
    });

    const { slots } = loadOutputSlots(dir);
    expect(slots.lyrics.settings).toMatchObject(guide);
    expect(projectPublicOutputSlots(slots).lyrics.settings).toMatchObject(
      guide,
    );
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

  it('returns an empty v5 document with the original template fonts', () => {
    const document = loadOutputSlots(dir);
    expect(document.version).toBe(5);
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
      setlist: {
        templateId: 'receipt-setlist',
        settings: { captureSize: 'large', fontFamily: 'template' },
      },
      lyrics: { settings: { captureSize: 'full', fontFamily: 'template' } },
    });
  });

  it('persists Phantom Thieves choices in the lyrics slot', () => {
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'phantom-thieves',
      settings: { phantomMode: 'chat', phantomChatShape: 'stacked' },
    });
    expect(loadOutputSlots(dir).slots.lyrics).toMatchObject({
      templateId: 'phantom-thieves',
      settings: {
        captureSize: 'full',
        phantomMode: 'chat',
        phantomChatShape: 'stacked',
      },
    });
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'phantom-thieves',
      settings: { phantomMode: 'ransom', phantomRansomFont: 'kaibunsyo' },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).toMatchObject({
      phantomMode: 'ransom',
      phantomRansomFont: 'kaibunsyo',
    });
    expect(() =>
      upsertOutputSlot(dir, 'setlist', {
        templateId: 'phantom-thieves',
        settings: {},
      }),
    ).toThrow();
  });

  it('retains portrait sets across templates and publishes only the selected portrait', () => {
    const first = {
      id: '00000000-0000-4000-8000-000000000001',
      phantomArtistName: 'Aster',
      phantomPortraitPhoto: '00000000-0000-4000-8000-000000000011',
      phantomPortraitColor: '#4466aa',
    };
    const second = {
      id: '00000000-0000-4000-8000-000000000002',
      phantomArtistName: 'Guest',
      phantomPortraitPhoto: '',
      phantomPortraitColor: '#f3d648',
    };
    const settings = {
      phantomMode: 'side-card',
      phantomCardStyle: 'portrait',
      phantomArtistName: 'Original',
      phantomPortraitSets: { activeId: first.id, items: [first, second] },
    };
    upsertOutputSlot(dir, 'lyrics', { templateId: 'karaoke-stack', settings });
    const stored = loadOutputSlots(dir).slots.lyrics.settings;
    expect(stored.phantomPortraitSets).toEqual({
      activeId: first.id,
      items: [
        expect.objectContaining({ phantomArtistName: 'Original' }),
        first,
        second,
      ],
    });
    expect(stored.phantomArtistName).toBe('');
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'phantom-thieves',
      settings: stored,
    });
    const server = createOutputServer({ port: 0 });
    server.setOverlaySlots(loadOutputSlots(dir).slots);
    const projected = server.getOverlayConfig().slots.lyrics.settings;
    expect(projected).toMatchObject({
      phantomArtistName: 'Aster',
      phantomPortraitPhoto: first.phantomPortraitPhoto,
      phantomPortraitColor: first.phantomPortraitColor,
    });
    expect(projected).not.toHaveProperty('phantomPortraitSets');

    server.setOverlaySlots({
      lyrics: {
        templateId: 'phantom-thieves',
        settings: {
          ...stored,
          phantomPortraitSets: { ...stored.phantomPortraitSets, activeId: '' },
        },
      },
    });
    expect(server.getOverlayConfig().slots.lyrics.settings).toMatchObject({
      phantomArtistName: '',
      phantomPortraitPhoto: '',
      phantomPortraitColor: '',
    });
  });

  it('moves the old yellow first slot to automatic color while preserving a saved yellow preset', () => {
    const preset = { id: randomUUID(), phantomPortraitColor: '#f3d648' };
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'phantom-thieves',
      settings: {
        phantomPortraitColor: '#f3d648',
        phantomPortraitSets: { activeId: preset.id, items: [preset] },
      },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).toMatchObject({
      phantomPortraitColor: '',
      phantomPortraitSets: { activeId: preset.id, items: [preset] },
    });
  });

  it('preserves a legacy first-cell override and all 12 custom sets across saves', () => {
    const items = Array.from({ length: 12 }, () => ({ id: randomUUID() }));
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 5,
        slots: {
          lyrics: {
            templateId: 'phantom-thieves',
            settings: {
              phantomArtistName: 'Original',
              phantomPortraitPhoto: '00000000-0000-4000-8000-000000000011',
              phantomPortraitColor: '#4466aa',
              phantomPortraitSets: { activeId: '', items },
            },
          },
        },
      }),
    );
    const slot = loadOutputSlots(dir).slots.lyrics;
    const sets = slot.settings.phantomPortraitSets;
    expect(sets.items.map(({ id }) => id)).toEqual([
      sets.activeId,
      ...items.map(({ id }) => id),
    ]);
    expect(sets.items[0]).toMatchObject({
      phantomArtistName: 'Original',
      phantomPortraitPhoto: '00000000-0000-4000-8000-000000000011',
      phantomPortraitColor: '#4466aa',
    });
    sets.activeId = '';
    upsertOutputSlot(dir, 'lyrics', slot);
    expect(
      loadOutputSlots(dir).slots.lyrics.settings.phantomPortraitSets,
    ).toEqual(sets);
  });

  it('reads legacy Fisheye decorations and persists independent choices', () => {
    const legacy = JSON.stringify({
      version: 5,
      slots: {
        lyrics: {
          templateId: 'fisheye-lens',
          settings: { fisheyeReflection: 65, fisheyeRim: 80 },
        },
      },
    });
    fs.writeFileSync(filePath, legacy);
    const { lyrics } = loadOutputSlots(dir).slots;
    expect(lyrics.settings).toMatchObject({
      fisheyeReflection: 'soft',
      fisheyeRim: 'standard',
    });
    expect(fs.readFileSync(filePath, 'utf8')).toBe(legacy);
    upsertOutputSlot(dir, 'lyrics', {
      ...lyrics,
      settings: { ...lyrics.settings, fisheyeRim: 'off' },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).toMatchObject({
      fisheyeReflection: 'soft',
      fisheyeRim: 'off',
    });
    expect(
      JSON.parse(fs.readFileSync(filePath, 'utf8')).slots.lyrics.settings,
    ).toMatchObject({ fisheyeReflection: 'soft', fisheyeRim: 'off' });
  });

  it('saves and reloads the ticket template at its fixed capture size', () => {
    upsertOutputSlot(dir, 'now-playing', {
      templateId: 'ticket-stub',
      settings: { captureSize: 'portrait', fontScale: 'large' },
    });

    expect(loadOutputSlots(dir).slots['now-playing']).toMatchObject({
      templateId: 'ticket-stub',
      settings: { captureSize: 'small', fontScale: 'large' },
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
      version: 5,
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
      version: 5,
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
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8')).version).toBe(5);
  });

  it('migrates v2 slots to the current version without losing slot settings', () => {
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
      version: 5,
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
    expect(document.version).toBe(5);
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

  it('discards previously inactive v4 fonts and keeps effective choices', () => {
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        version: 4,
        slots: {
          lyrics: {
            templateId: 'ornate-vertical',
            settings: { fontFamily: 'antique' },
          },
          setlist: {
            templateId: 'receipt-setlist',
            settings: { fontFamily: 'rounded' },
          },
          'now-playing': {
            templateId: 'cover-player',
            settings: { fontFamily: 'serif' },
          },
        },
      }),
    );

    const { slots, version } = loadOutputSlots(dir);
    expect(version).toBe(5);
    expect(slots.lyrics.settings.fontFamily).toBe('antique');
    expect(slots.setlist.settings).not.toHaveProperty('fontFamily');
    expect(slots['now-playing'].settings).not.toHaveProperty('fontFamily');
    expect(loadOutputSlots(dir).slots).toEqual(slots);
    expect(
      fs
        .readdirSync(dir)
        .some((name) => /^overlays\.json\.v4-.*\.bak$/.test(name)),
    ).toBe(true);
  });

  it('persists a bounded local font across all three output kinds', () => {
    const localFont = {
      source: 'local',
      family: 'Noto Sans CJK TC',
      postscriptName: 'NotoSansCJKtc-Regular',
      style: 'Regular',
    };
    for (const [kind, templateId] of [
      ['lyrics', 'karaoke-stack'],
      ['setlist', 'ribbon-setlist'],
      ['now-playing', 'ticket-stub'],
    ]) {
      upsertOutputSlot(dir, kind, {
        templateId,
        settings: { fontFamily: localFont },
      });
      expect(loadOutputSlots(dir).slots[kind].settings.fontFamily).toEqual(
        localFont,
      );
    }
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
      settings: { surface: 'soft', alignment: 'left', captureSize: 'medium' },
    });

    expect(loadOutputSlots(dir).slots['now-playing']).toEqual({
      templateId: 'cover-player',
      styleSetIds: ['runtime-source'],
      settings: {
        surface: 'soft',
        alignment: 'left',
        captureSize: 'portrait',
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

  it('persists the Ribbon Setlist review controls with transparent surface and 480×810 capture', () => {
    upsertOutputSlot(dir, 'setlist', {
      templateId: 'ribbon-setlist',
      settings: {
        surface: 'transparent',
        captureSize: 'medium',
        receiptReview: 'off',
        receiptReviewInterval: 27,
      },
    });
    expect(loadOutputSlots(dir).slots.setlist).toMatchObject({
      templateId: 'ribbon-setlist',
      settings: {
        surface: 'transparent',
        captureSize: 'large',
        receiptReview: 'off',
        receiptReviewInterval: 25,
      },
    });
  });

  it('validates and recalls independently saved Setlist backgrounds', () => {
    upsertOutputSlot(dir, 'setlist', {
      templateId: 'receipt-setlist',
      settings: {
        surface: 'custom',
        setlistBackgroundColor: '#ABCDEF',
        setlistBackgroundTransparency: 32.8,
      },
    });
    upsertOutputSlot(dir, 'setlist', {
      templateId: 'ribbon-setlist',
      recallAppearance: true,
      settings: { surface: 'transparent' },
    });
    expect(loadOutputSlots(dir).slots.setlist.settings).toEqual({
      captureSize: 'large',
      surface: 'transparent',
    });

    upsertOutputSlot(dir, 'setlist', {
      templateId: 'receipt-setlist',
      recallAppearance: true,
    });
    expect(loadOutputSlots(dir).slots.setlist.settings).toMatchObject({
      surface: 'custom',
      setlistBackgroundColor: '#abcdef',
      setlistBackgroundTransparency: 33,
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

    fs.writeFileSync(filePath, JSON.stringify({ version: 6, slots: {} }));
    expect(() => loadOutputSlots(dir)).toThrow(/newer overlays/i);
  });
});
