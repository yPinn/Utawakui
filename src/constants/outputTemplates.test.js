import { describe, expect, it, vi } from 'vitest';
import { outputAppearanceFieldKeysForTemplate } from '../../shared/outputAppearance.mjs';
import { lyricsTemplateCapabilities } from '../../shared/presentation/lyricsTemplateCapabilities.mjs';
import {
  OUTPUT_PREVIEW_SCENE,
  OUTPUT_TEMPLATE_KINDS,
  getOutputWorkbenchData,
  groupOutputTemplatesByKind,
  orderOutputTemplates,
} from './outputTemplates.js';
import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import { createOutputPreviewScene } from '../../shared/presentation/outputPreviewScene.mjs';

const EXPECTED_TEMPLATE_DISPLAY_NAMES = Object.freeze({
  'phantom-thieves': '幻影怪盜',
  'receipt-setlist': '票據歌單',
  'ribbon-setlist': '紅黑緞帶',
  'queue-board': '夜色歌單',
  'karaoke-stack': '經典字幕',
  'live-stage': '轉播字卡',
  'kinetic-pop': '躍動字幕',
  'ornate-vertical': '和風直書',
  'chalkboard-vertical': '黑板直書',
  'centered-vertical': '中央直書',
  'fisheye-lens': '魚眼鏡筒',
  'manga-frame': '分格對白',
  'art-card': '星空黑膠',
  'ticket-stub': '演出票根',
  'cover-player': '封面電台',
});

it('includes Textured Credits as a selectable Lyrics template in development', async () => {
  expect(
    getOutputWorkbenchData().templates.find(
      ({ id }) => id === 'textured-credits',
    ),
  ).toBeUndefined();
  vi.stubEnv('MODE', 'development');
  vi.resetModules();
  try {
    const dev = await import('./outputTemplates.js');
    const lyrics = dev
      .getOutputWorkbenchData()
      .templateGroups.find(({ kind }) => kind === 'lyrics');
    expect(
      lyrics.templates.find(({ id }) => id === 'textured-credits'),
    ).toMatchObject({
      name: '紋理顯字',
      availability: { available: true },
      facts: expect.arrayContaining([
        expect.objectContaining({ key: 'translation', value: '獨立字幕' }),
      ]),
    });
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});

const EXPECTED_TEMPLATE_APPEARANCE_KEYS = Object.freeze({
  'phantom-thieves': [
    'paletteId',
    'lookAmount',
    'phantomMode',
    'phantomChatShape',
    'phantomCardStyle',
    'phantomPortraitColor',
    'phantomArtistName',
    'phantomPortraitPhoto',
    'phantomCorner',
    'fontFamily',
    'phantomRansomFont',
    'fontScale',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'ribbon-setlist': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'surface',
    'receiptReview',
    'receiptReviewInterval',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'fisheye-lens': [
    'paletteId',
    'lookAmount',
    'fisheyeLayout',
    'fontFamily',
    'fontScale',
    'textColor',
    'fisheyeRim',
    'fisheyeReflection',
    'fisheyeEnter',
    'fisheyeExit',
    'fisheyePulse',
    'fisheyeBlur',
    'fisheyeGranularity',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'receipt-setlist': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'receiptDirection',
    'receiptReview',
    'receiptReviewInterval',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'queue-board': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'fontWeight',
    'surface',
    'spacingDensity',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'karaoke-stack': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'centered-vertical': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'contrastStyle',
    'textColor',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'chalkboard-vertical': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'textColor',
    'chalkboardRuleColor',
    'positionAnchor',
    'positionOffsetX',
    'positionOffsetY',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'live-stage': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'contrastStyle',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'kinetic-pop': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'kineticMaterial',
    'kineticArrangement',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'ornate-vertical': [
    'paletteId',
    'lookAmount',
    'textColor',
    'accentColor',
    'fontFamily',
    'fontScale',
    'ornateArrangement',
    'ornateColumnMode',
    'ornateEntrance',
    'textShadow',
    'sectionAccent',
    'positionAnchor',
    'positionOffsetX',
    'positionOffsetY',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'manga-frame': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'fontWeight',
    'furigana',
    'mangaBubbleStyle',
    'mangaTailDirection',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'art-card': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'fontWeight',
    'vinylSurfaceLight',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'ticket-stub': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'fontWeight',
    'filmGrainAmount',
    'filmGrainSize',
  ],
  'cover-player': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'fontWeight',
    'surface',
    'filmGrainAmount',
    'filmGrainSize',
  ],
});

function graphemeCount(value) {
  return Array.from(value).length;
}

function visibleTemplateCopy(template) {
  return [
    template.name,
    template.availability?.label,
    ...(template.facts ?? []).flatMap(({ label, value }) => [label, value]),
  ]
    .filter(Boolean)
    .join(' ');
}

describe('output template registry', () => {
  it('does not offer retired templates and uses supported defaults', () => {
    const data = getOutputWorkbenchData();
    expect(data.templates.map((template) => template.id)).not.toContain(
      'focus-line',
    );
    expect(data.templates.map((template) => template.id)).not.toContain(
      'now-next',
    );
    expect(data.slotDefaults.lyrics.templateId).toBe('karaoke-stack');
    expect(data.slotDefaults.setlist.templateId).toBe('receipt-setlist');
    expect(data.slotDefaults['now-playing'].templateId).toBe('art-card');
  });
  it('puts the recommended receipt first in the setlist gallery', () => {
    const data = getOutputWorkbenchData();
    const setlists = data.templateGroups.find(
      (group) => group.kind === 'setlist',
    ).templates;
    expect(setlists.map(({ id }) => id)).toEqual([
      'receipt-setlist',
      'queue-board',
      'ribbon-setlist',
    ]);
    expect(setlists[0].availability.label).toBe('建議');
    expect(setlists[1].availability.label).toBe('可用');
  });
  it('orders templates by output kind and template order', () => {
    const templates = [
      { id: 'late-lyrics', kind: 'lyrics', order: 90, name: 'Late Lyrics' },
      { id: 'now', kind: 'now-playing', order: 20, name: 'Now' },
      { id: 'queue', kind: 'setlist', order: 10, name: 'Queue' },
      { id: 'focus', kind: 'lyrics', order: 10, name: 'Focus' },
    ];

    expect(
      orderOutputTemplates(templates).map((template) => template.id),
    ).toEqual(['focus', 'late-lyrics', 'queue', 'now']);
  });

  it('groups templates without dropping unknown future kinds', () => {
    const grouped = groupOutputTemplatesByKind([
      { id: 'now', kind: 'now-playing', order: 10, name: 'Now' },
      { id: 'custom', kind: 'custom-widget', order: 10, name: 'Custom' },
      { id: 'lyrics', kind: 'lyrics', order: 10, name: 'Lyrics' },
    ]);

    expect(grouped.map((group) => group.kind)).toEqual([
      'lyrics',
      'now-playing',
      'custom-widget',
    ]);
    expect(grouped.at(-1)).toMatchObject({
      kind: 'custom-widget',
      label: 'Custom Widget',
    });
  });

  it('keeps three independent slot defaults internally consistent', () => {
    const data = getOutputWorkbenchData();
    const templateIds = new Set(data.templates.map((template) => template.id));

    expect(OUTPUT_TEMPLATE_KINDS.map((kind) => kind.id)).toEqual([
      'lyrics',
      'setlist',
      'now-playing',
    ]);
    expect(OUTPUT_TEMPLATE_KINDS.map((kind) => kind.label)).toEqual([
      '歌詞',
      '歌單',
      '播放中',
    ]);
    expect(Object.keys(data.slotDefaults)).toEqual([
      'lyrics',
      'setlist',
      'now-playing',
    ]);
    for (const slot of data.slotDefinitions) {
      expect(templateIds.has(data.slotDefaults[slot.id].templateId)).toBe(true);
    }
    expect(
      Object.values(data.slotDefaults).map((slot) => slot.settings.alignment),
    ).toEqual(['left', 'left', 'left']);
    expect(
      Object.values(data.slotDefaults).map((slot) => slot.settings.captureSize),
    ).toEqual(['full', 'large', 'small']);
    const kineticFields = data.templates.find(
      (template) => template.id === 'kinetic-pop',
    ).appearanceFields;
    expect(
      kineticFields.find((field) => field.key === 'kineticMaterial').options,
    ).toEqual([
      { id: 'solid-outline', label: '樣式 1｜單色黑框' },
      { id: 'candy-rim', label: '樣式 2｜漸層白框' },
      { id: 'chromatic-depth', label: '樣式 3｜右下錯位' },
      { id: 'cycle', label: '三款依句序切換' },
    ]);
    expect(
      Object.values(data.slotDefaults).map(
        (slot) => slot.settings.kineticMaterial,
      ),
    ).toEqual(['candy-rim', 'candy-rim', 'candy-rim']);
    expect(
      Object.values(data.slotDefaults).map(
        (slot) => slot.settings.kineticArrangement,
      ),
    ).toEqual(['straight', 'straight', 'straight']);
  });

  it('projects every template appearance contract into Workbench metadata', () => {
    const templates = getOutputWorkbenchData().templates;

    expect(
      Object.fromEntries(
        templates.map((template) => [
          template.id,
          template.appearanceFields?.map(({ key }) => key),
        ]),
      ),
    ).toEqual(EXPECTED_TEMPLATE_APPEARANCE_KEYS);

    for (const template of templates) {
      expect(
        outputAppearanceFieldKeysForTemplate(template.id),
        template.id,
      ).toEqual(EXPECTED_TEMPLATE_APPEARANCE_KEYS[template.id]);
    }
  });

  it('projects presentation policy controls separately from appearance controls', () => {
    const templates = getOutputWorkbenchData().templates;
    const liveStage = templates.find(
      (template) => template.id === 'live-stage',
    );

    expect(liveStage.appearanceFields.map(({ key }) => key)).toEqual([
      'paletteId',
      'lookAmount',
      'fontFamily',
      'fontScale',
      'contrastStyle',
      'filmGrainAmount',
      'filmGrainSize',
    ]);
    expect(liveStage.presentationFields).toEqual([
      expect.objectContaining({
        key: 'lyricsPresentationPolicyId',
        label: '歌詞呈現策略',
        groupLabel: '模板進階顯示',
        groupOrder: 90,
        defaultValue: 'balanced',
        options: [
          { id: 'broadcast-compact', label: '轉播精簡' },
          { id: 'balanced', label: '平衡分行' },
          { id: 'literal', label: '忠實原文' },
        ],
      }),
    ]);
    expect(
      templates
        .filter((template) => template.id !== 'live-stage')
        .every((template) => template.presentationFields.length === 0),
    ).toBe(true);
  });

  it('keeps stable storage ids behind a distinctive Chinese display system', () => {
    const templates = getOutputWorkbenchData().templates;

    expect(
      Object.fromEntries(
        templates.map((template) => [template.id, template.name]),
      ),
    ).toEqual(EXPECTED_TEMPLATE_DISPLAY_NAMES);
    expect(templates.map((template) => template.id).sort()).toEqual(
      Object.keys(EXPECTED_TEMPLATE_DISPLAY_NAMES).sort(),
    );

    for (const template of templates) {
      expect(template.name).toMatch(/^\p{Script=Han}{4,8}$/u);
      expect(
        visibleTemplateCopy(template).replaceAll('Utawakui', ''),
      ).not.toMatch(/[A-Za-z]/);
    }
  });

  // The gallery preview shows look and motion; facts say what it cannot, with
  // the same fields for every template of a kind.
  it('gives every template its kind’s fact fields and nothing else', () => {
    const templates = getOutputWorkbenchData().templates;
    const fieldsByKind = {
      lyrics: ['direction', 'language', 'translation'],
      setlist: ['content', 'paging'],
      'now-playing': ['artwork', 'progress'],
    };

    for (const template of templates) {
      expect(
        template.facts.map(({ key }) => key),
        template.id,
      ).toEqual(fieldsByKind[template.kind]);
      for (const fact of template.facts) {
        expect(fact.label, `${template.id} ${fact.key}`).toBeTruthy();
        expect(
          graphemeCount(fact.value),
          `${template.id} ${fact.key}`,
        ).toBeLessThanOrEqual(20);
      }
      for (const retired of [
        'summary',
        'detail',
        'tags',
        'settings',
        'preview',
      ])
        expect(retired in template, `${template.id} ${retired}`).toBe(false);
      expect(template.availability.summary, template.id).toBeUndefined();
    }
    const fact = (id, key) =>
      templates
        .find((template) => template.id === id)
        .facts.find((entry) => entry.key === key).value;
    for (const { id } of templates.filter(({ kind }) => kind === 'lyrics')) {
      expect(fact(id, 'translation'), id).toBe('獨立字幕');
    }
    expect(fact('ornate-vertical', 'language')).toBe('日文');
    expect(fact('karaoke-stack', 'language')).toBe('中日英');
    expect(fact('ornate-vertical', 'direction')).toBe('直書');
    expect(fact('fisheye-lens', 'direction')).toBe('沿弧線排列');
    expect(fact('queue-board', 'paging')).toBe('已唱曲目逐頁輪播');
    expect(fact('cover-player', 'progress')).toBe('進度條');
    expect(fact('ticket-stub', 'artwork')).toBe('缺圖時顯示曲名首字');
  });

  it('registers the first bundled appearance batch as independent Lyrics templates', () => {
    const lyricsGroup = getOutputWorkbenchData().templateGroups.find(
      (group) => group.kind === 'lyrics',
    );

    expect(lyricsGroup.templates.map((template) => template.id)).toEqual([
      'karaoke-stack',
      'live-stage',
      'kinetic-pop',
      'ornate-vertical',
      'chalkboard-vertical',
      'manga-frame',
      'centered-vertical',
      'fisheye-lens',
      'phantom-thieves',
    ]);
    expect(
      lyricsGroup.templates.find((template) => template.id === 'live-stage'),
    ).toMatchObject({
      kind: 'lyrics',
    });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'manga-frame'),
    ).toMatchObject({ kind: 'lyrics' });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'karaoke-stack'),
    ).toMatchObject({
      id: 'karaoke-stack',
      name: '經典字幕',
      kind: 'lyrics',
      editableAppearanceKeys: [
        'paletteId',
        'lookAmount',
        'fontFamily',
        'fontScale',
        'filmGrainAmount',
        'filmGrainSize',
      ],
    });
    expect(
      lyricsGroup.templates.some((template) => template.id === 'classic-ktv'),
    ).toBe(false);
    expect(
      Object.fromEntries(
        lyricsGroup.templates.map((template) => [
          template.id,
          template.presentationProfile,
        ]),
      ),
    ).toMatchObject({
      'karaoke-stack': { id: 'classic-ktv', version: 1, available: true },
      'kinetic-pop': { id: 'kinetic-pop', version: 1, available: true },
      'ornate-vertical': {
        id: 'ornate-vertical',
        version: 1,
        available: true,
      },
      'manga-frame': { id: 'manga-frame', version: 1, available: true },
      'centered-vertical': {
        id: 'centered-vertical',
        version: 1,
        available: true,
      },
      'chalkboard-vertical': {
        id: 'chalkboard-vertical',
        version: 1,
        available: true,
      },
      'live-stage': { id: 'live-stage', version: 1, available: true },
      'fisheye-lens': { id: 'fisheye-lens', version: 1, available: true },
    });
    for (const template of lyricsGroup.templates) {
      expect(template.lyricsCapabilities).toEqual(
        lyricsTemplateCapabilities(template.id),
      );
    }
    expect(
      lyricsGroup.templates.find((template) => template.id === 'kinetic-pop'),
    ).toMatchObject({
      id: 'kinetic-pop',
      name: '躍動字幕',
      kind: 'lyrics',
      editableAppearanceKeys: [
        'paletteId',
        'lookAmount',
        'fontFamily',
        'fontScale',
        'kineticMaterial',
        'kineticArrangement',
        'filmGrainAmount',
        'filmGrainSize',
      ],
    });
    expect(
      lyricsGroup.templates.find(
        (template) => template.id === 'ornate-vertical',
      ),
    ).toMatchObject({
      id: 'ornate-vertical',
      name: '和風直書',
      kind: 'lyrics',
      editableAppearanceKeys: [
        'paletteId',
        'lookAmount',
        'textColor',
        'accentColor',
        'fontFamily',
        'fontScale',
        'ornateArrangement',
        'ornateColumnMode',
        'ornateEntrance',
        'textShadow',
        'sectionAccent',
        'positionAnchor',
        'positionOffsetX',
        'positionOffsetY',
        'filmGrainAmount',
        'filmGrainSize',
      ],
      appearanceFields: expect.arrayContaining([
        expect.objectContaining({
          key: 'fontFamily',
          defaultValue: 'ornate',
        }),
        expect.objectContaining({ key: 'textColor', control: 'color' }),
        expect.objectContaining({ key: 'positionOffsetY', control: 'range' }),
      ]),
    });
  });

  it('registers compact and artwork layouts in one Now Playing family', () => {
    const nowPlayingGroup = getOutputWorkbenchData().templateGroups.find(
      (group) => group.kind === 'now-playing',
    );

    expect(
      nowPlayingGroup.templates.map(({ id, name, order }) => ({
        id,
        name,
        order,
      })),
    ).toEqual([
      { id: 'art-card', name: '星空黑膠', order: 10 },
      { id: 'ticket-stub', name: '演出票根', order: 20 },
      { id: 'cover-player', name: '封面電台', order: 30 },
    ]);
    expect(
      nowPlayingGroup.templates.find(
        (template) => template.id === 'cover-player',
      ),
    ).toMatchObject({
      kind: 'now-playing',
    });
    expect(
      getOutputWorkbenchData().templateGroups.some(
        (group) => group.kind === 'artwork',
      ),
    ).toBe(false);
  });

  it('builds an immutable shared scenario facade and returns independent consumer data', () => {
    const data = getOutputWorkbenchData();
    const expected = createOutputPreviewScene();
    expect(OUTPUT_PREVIEW_SCENE).toEqual(expected);
    expect(
      OUTPUT_PREVIEW_SCENE.lyrics.reading.segments
        .map((segment) => segment.text)
        .join(''),
    ).toBe(OUTPUT_PREVIEW_SCENE.lyrics.current);
    expect(Object.isFrozen(OUTPUT_PREVIEW_SCENE.lyrics.reading.segments)).toBe(
      true,
    );
    expect(OUTPUT_PREVIEW_SCENE.label).toBe(expected.label);
    expect(data.previewScene).toEqual(OUTPUT_PREVIEW_SCENE);
    expect(data.templates.some((template) => 'preview' in template)).toBe(
      false,
    );

    data.previewScene.track.title = 'changed';
    expect(OUTPUT_PREVIEW_SCENE.track.title).toBe(expected.track.title);
  });

  it('labels each slot default as 建議 and every other template as 可用', () => {
    const defaults = new Set(
      OUTPUT_TEMPLATE_VALUES.slots.map((slot) => slot.defaultTemplateId),
    );
    const { templates } = getOutputWorkbenchData();

    for (const template of templates) {
      expect(template.availability, template.id).toMatchObject(
        defaults.has(template.id)
          ? { label: '建議', tone: 'accent', available: true }
          : { label: '可用', tone: 'muted', available: true },
      );
      expect('tone' in template, template.id).toBe(false);
    }
    expect(
      templates.filter((template) => template.availability.label === '建議'),
    ).toHaveLength(OUTPUT_TEMPLATE_VALUES.slots.length);
  });
});
