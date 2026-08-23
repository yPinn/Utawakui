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
    ).toEqual(['now', 'queue', 'focus', 'late-lyrics']);
  });

  it('groups templates without dropping unknown future kinds', () => {
    const grouped = groupOutputTemplatesByKind([
      { id: 'now', kind: 'now-playing', order: 10, name: 'Now' },
      { id: 'custom', kind: 'custom-widget', order: 10, name: 'Custom' },
      { id: 'lyrics', kind: 'lyrics', order: 10, name: 'Lyrics' },
    ]);

    expect(grouped.map((group) => group.kind)).toEqual([
      'now-playing',
      'lyrics',
      'custom-widget',
    ]);
    expect(grouped.at(-1)).toMatchObject({
      kind: 'custom-widget',
      label: 'Custom Widget',
    });
  });

  it('keeps four independent slot defaults internally consistent', () => {
    const data = getOutputWorkbenchData();
    const templateIds = new Set(data.templates.map((template) => template.id));

    expect(OUTPUT_TEMPLATE_KINDS.map((kind) => kind.id)).toEqual([
      'now-playing',
      'setlist',
      'lyrics',
      'artwork',
    ]);
    expect(Object.keys(data.slotDefaults)).toEqual([
      'now-playing',
      'setlist',
      'lyrics',
      'artwork',
    ]);
    for (const slot of data.slotDefinitions) {
      expect(templateIds.has(data.slotDefaults[slot.id].templateId)).toBe(true);
    }
    expect(
      Object.values(data.slotDefaults).map((slot) => slot.settings.alignment),
    ).toEqual(['left', 'left', 'left', 'left']);
    expect(data.appearanceOptions.fontFamily).toHaveLength(3);
    expect(data.styleSets.length).toBeGreaterThan(0);
  });

  it('registers the first bundled appearance batch as independent Lyrics templates', () => {
    const lyricsGroup = getOutputWorkbenchData().templateGroups.find(
      (group) => group.kind === 'lyrics',
    );

    expect(lyricsGroup.templates.map((template) => template.id)).toEqual(
      expect.arrayContaining(['quiet-caption', 'manga-frame']),
    );
    expect(
      lyricsGroup.templates.find((template) => template.id === 'manga-frame'),
    ).toMatchObject({
      kind: 'lyrics',
      tone: 'manga',
      preview: { layoutLabel: '漫畫直書單句', motionLabel: '整框淡入淡出' },
    });
  });

  it('registers Cover Player as an independent Artwork template', () => {
    const artworkGroup = getOutputWorkbenchData().templateGroups.find(
      (group) => group.kind === 'artwork',
    );

    expect(artworkGroup.templates.map((template) => template.id)).toEqual(
      expect.arrayContaining(['art-card', 'cover-player']),
    );
    expect(
      artworkGroup.templates.find((template) => template.id === 'cover-player'),
    ).toMatchObject({
      kind: 'artwork',
      preview: { layoutLabel: '直式播放器', motionLabel: '進度同步' },
    });
  });

  it('uses one fixed Chinese preview scene for every template comparison', () => {
    const data = getOutputWorkbenchData();

    expect(OUTPUT_PREVIEW_SCENE.track).toEqual({
      title: '如果可以',
      artist: '韋禮安',
    });
    expect(OUTPUT_PREVIEW_SCENE.lyrics).toEqual({
      current: '目前歌詞',
      next: '下一句',
      reading: '歌詞讀音',
    });
    expect(OUTPUT_PREVIEW_SCENE.label).toBe('固定示例 · 中文');
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
