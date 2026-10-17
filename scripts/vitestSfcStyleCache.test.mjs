import { describe, expect, it, vi } from 'vitest';
import sfcStyleCache from './vitestSfcStyleCache.js';

const { createSfcStyleCachePlugin, shouldSkipFsModuleCache } = sfcStyleCache;

describe('Vitest SFC style cache plugin', () => {
  it('skips SFCs that load an external stylesheet and their style requests', () => {
    expect(
      shouldSkipFsModuleCache(
        '/repo/Preview.vue',
        '<template /><style src="./Preview.css"></style>',
      ),
    ).toBe(true);
    expect(
      shouldSkipFsModuleCache(
        '/repo/Preview.css?vue&type=style&index=0&src=1a2b&lang.css',
        '.a {}',
      ),
    ).toBe(true);
  });

  it('keeps caching ordinary SFCs, inline styles and other modules', () => {
    expect(
      shouldSkipFsModuleCache(
        '/repo/Button.vue',
        '<template /><style scoped>.a {}</style>',
      ),
    ).toBe(false);
    expect(
      shouldSkipFsModuleCache(
        '/repo/Button.vue?vue&type=style&index=0&scoped=1a2b&lang.css',
        '.a {}',
      ),
    ).toBe(false);
    expect(shouldSkipFsModuleCache('/repo/util.js', 'export {}')).toBe(false);
  });

  it('registers a cache key generator that only opts out matching modules', () => {
    const defineCacheKeyGenerator = vi.fn();
    createSfcStyleCachePlugin().configureVitest({
      experimental_defineCacheKeyGenerator: defineCacheKeyGenerator,
    });
    const generate = defineCacheKeyGenerator.mock.calls[0][0];

    expect(
      generate({ id: '/repo/A.vue', sourceCode: '<style src="./A.css" />' }),
    ).toBe(false);
    expect(
      generate({ id: '/repo/B.vue', sourceCode: '<style>.b {}</style>' }),
    ).toBeUndefined();
  });
});
