import { describe, expect, it } from 'vitest';
import { UI_DEMO_GROUPS } from './uiDemoSections.js';

describe('UI demo component order', () => {
  it('uses the conventional foundations-to-overlays order', () => {
    expect(UI_DEMO_GROUPS.map((group) => group.key)).toEqual([
      'foundations',
      'inputs',
      'actions',
      'feedback',
      'content',
      'overlays',
    ]);
  });

  it('covers every shared UI primitive exactly once', () => {
    const sections = UI_DEMO_GROUPS.flatMap((group) => group.sections);

    expect(sections.map((section) => section.key)).toEqual([
      'typography',
      'page-header',
      'text-field',
      'search-box',
      'buttons',
      'icon-buttons',
      'text-button',
      'chips',
      'status-icons',
      'hints',
      'notices',
      'marquee-text',
      'track-thumb',
      'collage-thumb',
      'track-rows',
      'context-menu',
      'modal',
    ]);
    expect(new Set(sections.map((section) => section.key)).size).toBe(
      sections.length,
    );
  });
});
