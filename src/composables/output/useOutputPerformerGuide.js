import { computed, shallowRef } from 'vue';
import {
  DEFAULT_PERFORMER_GUIDE,
  normalizePerformerGuide,
} from '../../utils/outputPerformerGuide.js';

const STORAGE_KEY = 'utawakui.output.performer-guide';

function readGuide() {
  try {
    const saved = JSON.parse(
      globalThis.localStorage?.getItem(STORAGE_KEY) ?? 'null',
    );
    if (
      (saved?.shape === 'ellipse' || saved?.shape === undefined) &&
      saved?.x === DEFAULT_PERFORMER_GUIDE.x &&
      saved.y === DEFAULT_PERFORMER_GUIDE.y &&
      saved.height === DEFAULT_PERFORMER_GUIDE.height &&
      saved.width === 0.48
    ) {
      return DEFAULT_PERFORMER_GUIDE;
    }
    return saved;
  } catch {
    return null;
  }
}

export function useOutputPerformerGuide() {
  const saved = shallowRef(normalizePerformerGuide(readGuide()));
  const draft = shallowRef(null);
  const guide = computed(() => draft.value ?? saved.value);

  function preview(value) {
    draft.value = value;
  }

  function commit(value) {
    if (!value) return;
    const next = normalizePerformerGuide(value);
    saved.value = next;
    draft.value = null;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Leave editing available even if the renderer's storage is inaccessible.
    }
  }

  return { guide, preview, commit };
}
