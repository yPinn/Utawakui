import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECIPE_ID,
  LEGACY_RESULT_DEFINITIONS,
  PUBLIC_RECIPE_CATALOG,
  getLegacyResultDefinition,
  isRunnableRecipe,
  resolveRecipe,
} from './recipes.js';

describe('audio-processing recipes', () => {
  it('uses stable product-role ids and keeps model identity in versioned profiles', () => {
    expect(DEFAULT_RECIPE_ID).toBe('general');
    expect(PUBLIC_RECIPE_CATALOG.map(({ id }) => id)).toEqual([
      'quick',
      'general',
      'refined',
      'backing-vocals',
    ]);
    expect(resolveRecipe('quick')).toMatchObject({
      id: 'quick',
      profileId: 'mdx-kara2-v1',
      modelIds: ['kara2'],
    });
    expect(resolveRecipe('general')).toMatchObject({
      id: 'general',
      profileId: 'mdx-inst-hq4-v1',
      modelIds: ['inst-hq4'],
    });
    expect(isRunnableRecipe('standard')).toBe(false);
    expect(isRunnableRecipe('clean')).toBe(false);
    expect(isRunnableRecipe('benchmark-hq3')).toBe(false);
    expect(() => resolveRecipe('benchmark-hq3')).toThrow(/unknown/i);
  });

  it('publishes a safe, unique product catalog with general as the default', () => {
    expect(DEFAULT_RECIPE_ID).toBe('general');
    expect(new Set(PUBLIC_RECIPE_CATALOG.map(({ id }) => id)).size).toBe(
      PUBLIC_RECIPE_CATALOG.length,
    );
    expect(PUBLIC_RECIPE_CATALOG.map(({ id }) => id)).toEqual([
      'quick',
      'general',
      'refined',
      'backing-vocals',
    ]);

    const publicKeys = new Set([
      'id',
      'label',
      'description',
      'availability',
      'implemented',
    ]);
    for (const recipe of PUBLIC_RECIPE_CATALOG) {
      expect(Object.keys(recipe).every((key) => publicKeys.has(key))).toBe(
        true,
      );
      expect(JSON.stringify(recipe)).not.toMatch(
        /engine|model|python|onnx|path|argument/i,
      );
    }
  });

  it('resolves only implemented recipes to private engine definitions', () => {
    expect(resolveRecipe('quick')).toMatchObject({
      id: 'quick',
      engineId: 'onnx-mdx',
      profileId: 'mdx-kara2-v1',
      modelIds: ['kara2'],
    });
    expect(resolveRecipe('general')).toMatchObject({
      id: 'general',
      engineId: 'onnx-mdx',
      profileId: 'mdx-inst-hq4-v1',
      modelIds: ['inst-hq4'],
    });
    expect(isRunnableRecipe('quick')).toBe(true);
    expect(isRunnableRecipe('general')).toBe(true);
    expect(isRunnableRecipe('refined')).toBe(false);
    expect(() => resolveRecipe('refined')).toThrow(/not available/i);
    expect(() => resolveRecipe('standard')).toThrow(/unknown/i);
    expect(() => resolveRecipe('clean')).toThrow(/unknown/i);
    expect(() => resolveRecipe('missing')).toThrow(/unknown/i);
  });

  it('keeps the removed KARA tier two as a non-runnable legacy result', () => {
    expect(LEGACY_RESULT_DEFINITIONS).toEqual([
      {
        id: 'high-quality',
        label: '舊版：和聲保留+',
        artifactFilename: 'high-quality.wav',
      },
    ]);
    expect(getLegacyResultDefinition('high-quality')).toEqual(
      LEGACY_RESULT_DEFINITIONS[0],
    );
    expect(getLegacyResultDefinition('quick')).toBeNull();
    expect(isRunnableRecipe('high-quality')).toBe(false);
    expect(() => resolveRecipe('high-quality')).toThrow(/unknown/i);
  });
});
