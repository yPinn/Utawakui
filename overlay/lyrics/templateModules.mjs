// Template-only code and styles load when a slot first selects the template.
const TEMPLATE_MODULES = Object.freeze({
  'fisheye-lens': {
    load: () =>
      Promise.all([
        import('./fisheyeLens.mjs'),
        import('./fisheyeEffects.mjs'),
      ]).then(([lens, effects]) => ({ ...lens, ...effects })),
  },
  'phantom-thieves': {
    load: () => import('./phantomThieves.mjs'),
    stylesheet: '/overlay/lyrics/phantomThieves.css',
  },
  'textured-credits': {
    load: () => import('./texturedCredits.mjs'),
    stylesheet: '/overlay/lyrics/texturedCredits.css',
    // PixiJS IIFE builds attach to globalThis.PIXI and must run in order.
    scripts: [
      '/overlay/vendor/pixi.min.js',
      '/overlay/vendor/pixi-unsafe-eval.min.js',
      '/overlay/vendor/pixi-filters.js',
    ],
  },
});

const loadedModules = new Map();
const pendingLoads = new Map();

export const LAZY_LYRICS_TEMPLATE_IDS = Object.freeze(
  Object.keys(TEMPLATE_MODULES),
);

export function lyricsTemplateModule(templateId) {
  return loadedModules.get(templateId) ?? null;
}

function loadStylesheet(documentApi, href) {
  if (!documentApi?.createElement || !documentApi.head) return null;
  const existing = [...documentApi.head.querySelectorAll('link')].find(
    (link) => link.getAttribute('href') === href,
  );
  if (existing) return null;
  const link = documentApi.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  return new Promise((resolve, reject) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener(
      'error',
      () => {
        link.remove();
        reject(new Error(`Template stylesheet failed: ${href}`));
      },
      { once: true },
    );
    documentApi.head.append(link);
  });
}

function loadScript(documentApi, src) {
  if (!documentApi?.createElement || !documentApi.head) return null;
  const existing = [...documentApi.head.querySelectorAll('script')].find(
    (script) => script.getAttribute('src') === src,
  );
  if (existing) return null;
  const script = documentApi.createElement('script');
  script.src = src;
  script.async = false;
  return new Promise((resolve, reject) => {
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener(
      'error',
      () => {
        script.remove();
        reject(new Error(`Template script failed: ${src}`));
      },
      { once: true },
    );
    documentApi.head.append(script);
  });
}

async function loadScripts(documentApi, sources = []) {
  for (const src of sources) await loadScript(documentApi, src);
}

// Returns null when nothing has to load, so callers can stay synchronous.
export function loadLyricsTemplateModule(
  templateId,
  documentApi = globalThis.document,
) {
  const entry = TEMPLATE_MODULES[templateId];
  if (!entry || loadedModules.has(templateId)) return null;
  if (!pendingLoads.has(templateId)) {
    const pending = Promise.all([
      entry.load(),
      entry.stylesheet ? loadStylesheet(documentApi, entry.stylesheet) : null,
    ])
      .then(async ([module]) => {
        // Start optional scripts only after the required assets are ready so a
        // retry can never skip a vendor script that is still loading.
        if (entry.scripts)
          await loadScripts(documentApi, entry.scripts).catch(() => null);
        loadedModules.set(templateId, module);
        return module;
      })
      .finally(() => pendingLoads.delete(templateId));
    pendingLoads.set(templateId, pending);
  }
  return pendingLoads.get(templateId);
}
