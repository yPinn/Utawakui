import { describe, expect, it } from 'vitest';
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
  'receipt-setlist': '票據歌單',
  'queue-board': '夜色歌單',
  'karaoke-stack': '經典字幕',
  'live-stage': '舞台字幕',
  'kinetic-pop': '躍動字幕',
  'ornate-vertical': '和風直書',
  'manga-frame': '分格對白',
  'art-card': '星空黑膠',
  'cover-player': '封面電台',
});

const EXPECTED_TEMPLATE_APPEARANCE_KEYS = Object.freeze({
  'receipt-setlist': [
    'fontScale',
    'receiptDirection',
    'receiptReview',
    'receiptReviewInterval',
  ],
  'queue-board': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'fontWeight',
    'surface',
    'spacingDensity',
  ],
  'karaoke-stack': ['paletteId', 'lookAmount', 'fontScale'],
  'live-stage': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'contrastStyle',
  ],
  'kinetic-pop': [
    'paletteId',
    'lookAmount',
    'fontScale',
    'kineticMaterial',
    'kineticArrangement',
  ],
  'ornate-vertical': [
    'paletteId',
    'lookAmount',
    'textColor',
    'accentColor',
    'fontFamily',
    'fontScale',
    'positionAnchor',
    'positionOffsetX',
    'positionOffsetY',
  ],
  'manga-frame': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'fontWeight',
    'furigana',
  ],
  'art-card': [
    'paletteId',
    'lookAmount',
    'fontFamily',
    'fontScale',
    'fontWeight',
  ],
  'cover-player': [
    'paletteId',
    'lookAmount',
    'fontScale',
    'fontWeight',
    'surface',
  ],
});

function graphemeCount(value) {
  return Array.from(value).length;
}

function visibleTemplateCopy(template) {
  return [
    template.name,
    template.availability?.label,
    template.availability?.summary,
    template.summary,
    template.detail,
    template.preview?.layoutLabel,
    template.preview?.motionLabel,
    ...(template.tags ?? []),
    ...(template.settings ?? []).flatMap(({ label, value }) => [label, value]),
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
    expect(data.styleSets.length).toBeGreaterThan(0);
  });

  it('describes Setlist as a two-region layout without a dedicated spacer row', () => {
    const styleSet = getOutputWorkbenchData().styleSets.find(
      ({ id }) => id === 'setlist-layout',
    );

    expect(styleSet).toMatchObject({
      summary: 'Simple Black B 以目前歌曲焦點區與彈性已唱紀錄構成。',
      tokens: [
        { label: '目前', value: '約 20%' },
        { label: '間隔', value: '語意留白' },
        { label: '歷史', value: '彈性填滿' },
      ],
    });
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

  it('describes the Kinetic Pop burst consistently for every visible phrase', () => {
    const kineticPop = getOutputWorkbenchData().templates.find(
      (template) => template.id === 'kinetic-pop',
    );
    const copy = visibleTemplateCopy(kineticPop);

    expect(copy).toContain('每段逐字交錯跳入');
    expect(copy).toContain('逐字定點交錯跳入');
    expect(copy).toContain('可選端正或些微偏移');
    expect(copy).not.toMatch(/短句|長句直切|長句保持穩定/);
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

  it('keeps every template copy layer within its gallery reading budget', () => {
    const templates = getOutputWorkbenchData().templates;

    for (const template of templates) {
      expect(
        graphemeCount(template.summary),
        `${template.id} summary`,
      ).toBeLessThanOrEqual(24);
      expect(
        graphemeCount(template.detail),
        `${template.id} detail`,
      ).toBeLessThanOrEqual(48);
      expect(
        graphemeCount(template.availability.summary),
        `${template.id} availability`,
      ).toBeLessThanOrEqual(32);
      expect(
        graphemeCount(template.preview.layoutLabel),
        `${template.id} layout label`,
      ).toBeLessThanOrEqual(7);
      expect(
        graphemeCount(template.preview.motionLabel),
        `${template.id} motion label`,
      ).toBeLessThanOrEqual(6);
      expect(
        graphemeCount(template.preview.layoutLabel) +
          graphemeCount(template.preview.motionLabel),
        `${template.id} card metadata`,
      ).toBeLessThanOrEqual(14);
      expect(template.tags).toHaveLength(3);
      for (const tag of template.tags) {
        expect(
          graphemeCount(tag),
          `${template.id} tag: ${tag}`,
        ).toBeGreaterThanOrEqual(2);
        expect(
          graphemeCount(tag),
          `${template.id} tag: ${tag}`,
        ).toBeLessThanOrEqual(5);
      }
      for (const setting of template.settings) {
        expect(
          graphemeCount(setting.value),
          `${template.id} setting: ${setting.label}`,
        ).toBeLessThanOrEqual(16);
      }
    }
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
      'manga-frame',
    ]);
    expect(
      lyricsGroup.templates.find((template) => template.id === 'live-stage'),
    ).toMatchObject({
      kind: 'lyrics',
      detail:
        '寬幅歌詞固定在左下；開場時於右下短暫亮出精簡曲目字卡，中央保留給表演者。',
      preview: {
        layoutLabel: '舞台雙行',
        motionLabel: '字卡進場',
      },
      settings: expect.arrayContaining([
        { label: '歌詞', value: '左下寬幅、最多兩行' },
        { label: '字卡', value: '右下精簡、播放後四至八秒' },
        { label: '品牌', value: '上方低干擾舞台識別' },
      ]),
    });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'manga-frame'),
    ).toMatchObject({
      kind: 'lyrics',
      preview: { layoutLabel: '直書對白', motionLabel: '整框淡入' },
    });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'karaoke-stack'),
    ).toMatchObject({
      id: 'karaoke-stack',
      name: '經典字幕',
      kind: 'lyrics',
      preview: {
        layoutLabel: '錯位雙行',
        motionLabel: '逐字掃色',
      },
      editableAppearanceKeys: ['paletteId', 'lookAmount', 'fontScale'],
      detail: expect.stringContaining('提示點先行倒數'),
      settings: expect.arrayContaining([
        { label: '顯示', value: '上列靠左、下列靠右' },
        { label: '倒數', value: '依歌曲節拍對齊' },
        { label: '換詞', value: '唱完保留零點六秒' },
        { label: '外觀', value: '白字藍框、角色色掃字' },
        { label: '進度', value: '逐行估算／逐字精確' },
      ]),
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
      'live-stage': { id: 'live-stage', version: 1, available: true },
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
      preview: {
        layoutLabel: '底部跳字',
        motionLabel: '定點交錯',
      },
      editableAppearanceKeys: [
        'paletteId',
        'lookAmount',
        'fontScale',
        'kineticMaterial',
        'kineticArrangement',
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
      preview: {
        layoutLabel: '華麗直書',
        motionLabel: '群字綴現',
      },
      detail:
        '以華麗明朝體直書，長句會在可信邊界拆成右起雙欄；可調整字色、大小與右側位置。',
      settings: expect.arrayContaining([
        { label: '排版', value: '直書、固定右側' },
        { label: '長句', value: '自動拆成至多兩欄' },
        { label: '藝術字', value: '同尺寸輕墨層' },
      ]),
      editableAppearanceKeys: [
        'paletteId',
        'lookAmount',
        'textColor',
        'accentColor',
        'fontFamily',
        'fontScale',
        'positionAnchor',
        'positionOffsetX',
        'positionOffsetY',
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
      { id: 'cover-player', name: '封面電台', order: 30 },
    ]);
    expect(
      nowPlayingGroup.templates.find(
        (template) => template.id === 'cover-player',
      ),
    ).toMatchObject({
      kind: 'now-playing',
      preview: { layoutLabel: '直式封面卡', motionLabel: '進度同步' },
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
    expect(
      data.templates.every(
        (template) =>
          template.preview?.layoutLabel &&
          template.preview?.motionLabel &&
          !('title' in template.preview) &&
          !('lines' in template.preview),
      ),
    ).toBe(true);

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
      expect(template.availability.summary, template.id).toBeTruthy();
      expect('tone' in template, template.id).toBe(false);
    }
    expect(
      templates.filter((template) => template.availability.label === '建議'),
    ).toHaveLength(OUTPUT_TEMPLATE_VALUES.slots.length);
  });
});
