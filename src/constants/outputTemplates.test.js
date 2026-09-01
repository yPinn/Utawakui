import { describe, expect, it } from 'vitest';
import {
  OUTPUT_PREVIEW_SCENE,
  OUTPUT_TEMPLATE_KINDS,
  getOutputWorkbenchData,
  groupOutputTemplatesByKind,
  orderOutputTemplates,
} from './outputTemplates.js';

const EXPECTED_TEMPLATE_DISPLAY_NAMES = Object.freeze({
  'queue-board': '黑幕歌單',
  'karaoke-stack': '經典伴唱',
  'live-stage': '舞台轉播',
  'manga-frame': '漫畫對白',
  'quiet-caption': '靜語雙行',
  'focus-line': '聚焦歌詞',
  'reading-aid': '讀音跟唱',
  'art-card': '星染黑膠',
  'now-next': '浮光光碟',
  'cover-player': '封面播放卡',
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
  it('orders templates by output kind and template order', () => {
    const templates = [
      { id: 'late-lyrics', kind: 'lyrics', order: 90, name: 'Late Lyrics' },
      { id: 'now', kind: 'now-playing', order: 20, name: 'Now' },
      { id: 'queue', kind: 'setlist', order: 10, name: 'Queue' },
      { id: 'focus', kind: 'lyrics', order: 10, name: 'Focus' },
    ];

    expect(
      orderOutputTemplates(templates).map((template) => template.id),
    ).toEqual(['queue', 'focus', 'late-lyrics', 'now']);
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
      'setlist',
      'lyrics',
      'now-playing',
    ]);
    expect(OUTPUT_TEMPLATE_KINDS.map((kind) => kind.label)).toEqual([
      '歌單',
      '歌詞',
      '播放中',
    ]);
    expect(Object.keys(data.slotDefaults)).toEqual([
      'setlist',
      'lyrics',
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
    ).toEqual(['large', 'full', 'small']);
    expect(data.appearanceOptions.fontFamily).toHaveLength(3);
    expect(data.styleSets.length).toBeGreaterThan(0);
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
      'manga-frame',
      'quiet-caption',
      'focus-line',
      'reading-aid',
    ]);
    expect(
      lyricsGroup.templates.find((template) => template.id === 'live-stage'),
    ).toMatchObject({
      kind: 'lyrics',
      tone: 'stage',
      preview: {
        layoutLabel: '舞台雙行',
        motionLabel: '字卡進場',
      },
    });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'manga-frame'),
    ).toMatchObject({
      kind: 'lyrics',
      tone: 'manga',
      preview: { layoutLabel: '直書對白', motionLabel: '整框淡入' },
    });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'karaoke-stack'),
    ).toMatchObject({
      id: 'karaoke-stack',
      name: '經典伴唱',
      kind: 'lyrics',
      preview: {
        layoutLabel: '錯位雙行',
        motionLabel: '逐字掃色',
      },
      editableAppearanceKeys: ['fontScale'],
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
      'focus-line': { id: 'generic-caption', version: 1, available: true },
      'quiet-caption': { id: 'generic-caption', version: 1, available: true },
      'karaoke-stack': { id: 'classic-ktv', version: 1, available: true },
      'manga-frame': { id: 'manga-frame', version: 1, available: true },
      'live-stage': { id: 'live-stage', version: 1, available: true },
      'reading-aid': { id: 'reading-aid', version: 1, available: false },
    });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'reading-aid'),
    ).toMatchObject({
      availability: { available: false, label: '尚未提供' },
      editableAppearanceKeys: [],
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
      { id: 'art-card', name: '星染黑膠', order: 10 },
      { id: 'now-next', name: '浮光光碟', order: 20 },
      { id: 'cover-player', name: '封面播放卡', order: 30 },
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

  it('uses one fixed multilingual preview scene for every template comparison', () => {
    const data = getOutputWorkbenchData();

    expect(OUTPUT_PREVIEW_SCENE.track).toEqual({
      title: '如果可以',
      artist: '韋禮安',
    });
    expect(OUTPUT_PREVIEW_SCENE.lyrics).toEqual({
      current: '目前歌詞',
      next: '下一句',
      reading: '歌詞讀音',
      manga: {
        current: '地下鉄に飲み込まれる',
        language: 'ja',
        reading: {
          text: '地下鉄に飲み込まれる',
          segments: [
            { text: '地下鉄', reading: 'ちかてつ' },
            { text: 'に' },
            { text: '飲み込まれる', reading: 'のみこまれる' },
          ],
        },
      },
    });
    expect(OUTPUT_PREVIEW_SCENE.label).toBe('固定示例 · 多語');
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
    expect(OUTPUT_PREVIEW_SCENE.track.title).toBe('如果可以');
  });
});
