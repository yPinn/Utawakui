import { describe, expect, it } from 'vitest';
import {
  OUTPUT_TEMPLATE_KINDS,
  getDefaultOutputProfile,
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

  it('keeps default profile and workbench data internally consistent', () => {
    const data = getOutputWorkbenchData();
    const profile = getDefaultOutputProfile();
    const templateIds = new Set(data.templates.map((template) => template.id));

    expect(OUTPUT_TEMPLATE_KINDS.map((kind) => kind.id)).toEqual([
      'now-playing',
      'setlist',
      'lyrics',
      'artwork',
      'composite',
    ]);
    expect(templateIds.has(profile.templateId)).toBe(true);
    expect(data.configs.some((config) => config.active)).toBe(true);
    expect(data.styleSets.length).toBeGreaterThan(0);
  });
});
