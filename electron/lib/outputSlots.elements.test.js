import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadOutputSlots, upsertOutputSlot } from './outputSlots.js';

// Keep real atomic-rename tests out of the sandbox's restricted TEMP.
const testTmpRoot = fileURLToPath(new URL('../../.tmp/', import.meta.url));

describe('outputSlots element settings', () => {
  let dir;

  beforeEach(() => {
    fs.mkdirSync(testTmpRoot, { recursive: true });
    dir = fs.mkdtempSync(path.join(testTmpRoot, 'utawakui-output-element-'));
  });

  afterEach(() => {
    expect(path.dirname(dir)).toBe(path.resolve(testTmpRoot));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps declared element settings and drops invalid or undeclared ones', () => {
    upsertOutputSlot(dir, 'now-playing', {
      templateId: 'cover-player',
      settings: {
        'element.title.fontWeight': 'bold',
        'element.title.fontSizeScale': 140,
        'element.artist.visible': 'hidden',
        'element.title.visible': 'hidden',
        'element.artwork.visible': 'hidden',
        'element.artist.fontWeight': 'heavy',
      },
    });

    const { settings } = loadOutputSlots(dir).slots['now-playing'];
    expect(settings).toMatchObject({
      'element.title.fontWeight': 'bold',
      'element.title.fontSizeScale': 125,
      'element.artist.visible': 'hidden',
    });
    expect(settings).not.toHaveProperty(['element.title.visible']);
    expect(settings).not.toHaveProperty(['element.artwork.visible']);
    expect(settings).not.toHaveProperty(['element.artist.fontWeight']);
  });

  it('drops element settings for a template that declares no elements', () => {
    upsertOutputSlot(dir, 'now-playing', {
      templateId: 'art-card',
      settings: { 'element.artist.visible': 'hidden' },
    });

    expect(
      loadOutputSlots(dir).slots['now-playing'].settings,
    ).not.toHaveProperty(['element.artist.visible']);
  });
});
