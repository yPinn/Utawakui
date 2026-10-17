'use strict';

// plugin-vue keeps SFC descriptors in memory. When fsModuleCache restores a
// .vue module but its <style src> file changed, the style sub-request runs
// without a descriptor and fails, so these SFCs skip the file cache.
const EXTERNAL_STYLE = /<style[^>]*\ssrc=/u;

function shouldSkipFsModuleCache(id, sourceCode) {
  const [file, query = ''] = String(id).split('?');
  if (query.includes('vue&type=style') && query.includes('&src=')) {
    return true;
  }
  return !query && file.endsWith('.vue') && EXTERNAL_STYLE.test(sourceCode);
}

function createSfcStyleCachePlugin() {
  return {
    name: 'utawakui:sfc-style-cache',
    // Vitest 4.1 exposes the hook as experimental_*; later docs drop the prefix.
    configureVitest(context) {
      const define =
        context.experimental_defineCacheKeyGenerator ??
        context.defineCacheKeyGenerator;
      define?.(({ id, sourceCode }) =>
        shouldSkipFsModuleCache(id, sourceCode) ? false : undefined,
      );
    },
  };
}

module.exports = { createSfcStyleCachePlugin, shouldSkipFsModuleCache };
