import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createOutputServer } from './outputServer.js';
import {
  loadOutputSlots,
  OUTPUT_SLOTS_FILENAME,
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

  it('persists Cutout Dialogue choices in the lyrics slot', () => {
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'cutout-dialogue',
      settings: { cutoutMode: 'chat', cutoutChatShape: 'stacked' },
    });
    expect(loadOutputSlots(dir).slots.lyrics).toMatchObject({
      templateId: 'cutout-dialogue',
      settings: {
        captureSize: 'full',
        cutoutMode: 'chat',
        cutoutChatShape: 'stacked',
      },
    });
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'cutout-dialogue',
      settings: { cutoutMode: 'ransom', cutoutRansomFont: 'kaibunsyo' },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).toMatchObject({
      cutoutMode: 'ransom',
      cutoutRansomFont: 'kaibunsyo',
    });
    expect(() =>
      upsertOutputSlot(dir, 'setlist', {
        templateId: 'cutout-dialogue',
        settings: {},
      }),
    ).toThrow();
  });

  it('retains portrait sets across templates and publishes only the selected portrait', () => {
    const first = {
      id: '00000000-0000-4000-8000-000000000001',
      cutoutArtistName: 'Aster',
      cutoutPortraitPhoto: '00000000-0000-4000-8000-000000000011',
      cutoutPortraitColor: '#4466aa',
    };
    const second = {
      id: '00000000-0000-4000-8000-000000000002',
      cutoutArtistName: 'Guest',
      cutoutPortraitPhoto: '',
      cutoutPortraitColor: '#f3d648',
    };
    const settings = {
      cutoutMode: 'side-card',
      cutoutCardStyle: 'portrait',
      cutoutArtistName: 'Original',
      cutoutPortraitSets: { activeId: first.id, items: [first, second] },
    };
    upsertOutputSlot(dir, 'lyrics', { templateId: 'karaoke-stack', settings });
    const stored = loadOutputSlots(dir).slots.lyrics.settings;
    expect(stored.cutoutPortraitSets).toEqual({
      activeId: first.id,
      items: [
        expect.objectContaining({ cutoutArtistName: 'Original' }),
        first,
        second,
      ],
    });
    expect(stored.cutoutArtistName).toBe('');
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'cutout-dialogue',
      settings: stored,
    });
    const server = createOutputServer({ port: 0 });
    server.setOverlaySlots(loadOutputSlots(dir).slots);
    const projected = server.getOverlayConfig().slots.lyrics.settings;
    expect(projected).toMatchObject({
      cutoutArtistName: 'Aster',
      cutoutPortraitPhoto: first.cutoutPortraitPhoto,
      cutoutPortraitColor: first.cutoutPortraitColor,
    });
    expect(projected).not.toHaveProperty('cutoutPortraitSets');

    server.setOverlaySlots({
      lyrics: {
        templateId: 'cutout-dialogue',
        settings: {
          ...stored,
          cutoutPortraitSets: { ...stored.cutoutPortraitSets, activeId: '' },
        },
      },
    });
    expect(server.getOverlayConfig().slots.lyrics.settings).toMatchObject({
      cutoutArtistName: '',
      cutoutPortraitPhoto: '',
      cutoutPortraitColor: '',
    });
  });

  it('moves the old yellow first slot to automatic color while preserving a saved yellow preset', () => {
    const preset = { id: randomUUID(), cutoutPortraitColor: '#f3d648' };
    upsertOutputSlot(dir, 'lyrics', {
      templateId: 'cutout-dialogue',
      settings: {
        cutoutPortraitColor: '#f3d648',
        cutoutPortraitSets: { activeId: preset.id, items: [preset] },
      },
    });
    expect(loadOutputSlots(dir).slots.lyrics.settings).toMatchObject({
      cutoutPortraitColor: '',
      cutoutPortraitSets: { activeId: preset.id, items: [preset] },
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
            templateId: 'cutout-dialogue',
            settings: {
              cutoutArtistName: 'Original',
              cutoutPortraitPhoto: '00000000-0000-4000-8000-000000000011',
              cutoutPortraitColor: '#4466aa',
              cutoutPortraitSets: { activeId: '', items },
            },
          },
        },
      }),
    );
    const slot = loadOutputSlots(dir).slots.lyrics;
    const sets = slot.settings.cutoutPortraitSets;
    expect(sets.items.map(({ id }) => id)).toEqual([
      sets.activeId,
      ...items.map(({ id }) => id),
    ]);
    expect(sets.items[0]).toMatchObject({
      cutoutArtistName: 'Original',
      cutoutPortraitPhoto: '00000000-0000-4000-8000-000000000011',
      cutoutPortraitColor: '#4466aa',
    });
    sets.activeId = '';
    upsertOutputSlot(dir, 'lyrics', slot);
    expect(
      loadOutputSlots(dir).slots.lyrics.settings.cutoutPortraitSets,
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
