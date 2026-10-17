import { detectLyricsScript } from './lyrics.js';

export function createLyricsTextVariantLoader({
  load = () => import('./lyricsTextVariant.js'),
} = {}) {
  let projector = null;
  let pending = null;

  function prepare(document) {
    const text = (document?.lines ?? []).map((line) => line.text).join('\n');
    if (projector || detectLyricsScript(text) !== 'zh') return null;
    // Prepare even in original mode, so later variant toggles stay synchronous.
    pending ??= load()
      .then((module) => {
        projector = module.projectLyricsTextVariant;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  function project(document, options) {
    // Source owners await prepare before publishing Chinese documents.
    return projector ? projector(document, options) : document;
  }

  return { prepare, project };
}

export const lyricsTextVariantLoader = createLyricsTextVariantLoader();
