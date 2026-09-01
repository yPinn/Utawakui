import { describe, expect, it } from 'vitest';
import {
  OUTPUT_PREVIEW_SCENE,
  OUTPUT_TEMPLATE_KINDS,
  getOutputWorkbenchData,
  groupOutputTemplatesByKind,
  orderOutputTemplates,
} from './outputTemplates.js';

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

  it('registers the first bundled appearance batch as independent Lyrics templates', () => {
    const lyricsGroup = getOutputWorkbenchData().templateGroups.find(
      (group) => group.kind === 'lyrics',
    );

    expect(lyricsGroup.templates.map((template) => template.id)).toEqual(
      expect.arrayContaining(['quiet-caption', 'live-stage', 'manga-frame']),
    );
    expect(
      lyricsGroup.templates.find((template) => template.id === 'live-stage'),
    ).toMatchObject({
      kind: 'lyrics',
      tone: 'stage',
      preview: {
        layoutLabel: '舞台轉播字幕',
        motionLabel: '獨立字卡時間軸',
      },
    });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'manga-frame'),
    ).toMatchObject({
      kind: 'lyrics',
      tone: 'manga',
      preview: { layoutLabel: '漫畫直書單句', motionLabel: '整框淡入淡出' },
    });
    expect(
      lyricsGroup.templates.find((template) => template.id === 'karaoke-stack'),
    ).toMatchObject({
      id: 'karaoke-stack',
      name: 'Classic KTV',
      kind: 'lyrics',
      preview: {
        layoutLabel: '經典 KTV 雙行',
        motionLabel: '由左至右掃色',
      },
      editableAppearanceKeys: ['fontScale'],
      detail: expect.stringContaining('A 列固定在上方靠左'),
      settings: expect.arrayContaining([
        { label: '顯示', value: 'A 上左、B 下右，逐行交替' },
        { label: '倒數', value: '歌詞與四點同時出現，依 BPM 倒數' },
        { label: '換詞', value: '唱完短暫保留 0.6 秒' },
        { label: '外觀', value: '白字深藍框、唱過角色色配白邊' },
        { label: '進度', value: 'T1 字／詞估算、T2 精確掃色' },
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
      { id: 'now-next', name: 'Compact CD', order: 10 },
      { id: 'art-card', name: '黑膠主題', order: 20 },
      { id: 'cover-player', name: 'Cover Player', order: 30 },
    ]);
    expect(
      nowPlayingGroup.templates.find(
        (template) => template.id === 'cover-player',
      ),
    ).toMatchObject({
      kind: 'now-playing',
      preview: { layoutLabel: '直式播放器', motionLabel: '進度同步' },
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
