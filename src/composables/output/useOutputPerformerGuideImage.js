import { computed, onMounted, shallowRef } from 'vue';
import streamerGuide from '../../../overlay/assets/streamer-guide.png?inline';
import {
  loadPerformerGuideImage,
  preparePerformerGuideImage,
  savePerformerGuideImage,
} from '../../utils/outputPerformerGuideImage.js';

const builtInUrl = shallowRef(null);
const customUrl = shallowRef(null);
const src = computed(() => customUrl.value ?? builtInUrl.value);
const custom = computed(() => Boolean(customUrl.value));
const busy = shallowRef(true);
const error = shallowRef('');
let initialization;

async function loadBuiltInImage() {
  // Decode the bytes locally so canvas readback works under the packaged file origin.
  const bytes = Uint8Array.from(
    atob(streamerGuide.slice(streamerGuide.indexOf(',') + 1)),
    (character) => character.charCodeAt(0),
  );
  const source = new Blob([bytes], { type: 'image/png' });
  const trimmed = await preparePerformerGuideImage(source).catch(() => null);
  return trimmed ?? source;
}

function setCustom(image) {
  const oldUrl = customUrl.value;
  customUrl.value = image ? URL.createObjectURL(image) : null;
  if (oldUrl) URL.revokeObjectURL(oldUrl);
}

async function initialize() {
  const [saved, builtIn] = await Promise.all([
    loadPerformerGuideImage().catch(() => null),
    loadBuiltInImage().catch(() => null),
  ]);
  if (builtIn) builtInUrl.value = URL.createObjectURL(builtIn);
  if (saved instanceof Blob) setCustom(saved);
  busy.value = false;
}

async function change(image) {
  if (busy.value) return false;
  error.value = '';
  busy.value = true;
  try {
    await savePerformerGuideImage(image);
    setCustom(image);
    return true;
  } catch {
    error.value = 'outputPanel.performerGuide.imageSaveFailed';
    return false;
  } finally {
    busy.value = false;
  }
}

export function useOutputPerformerGuideImage() {
  onMounted(() => {
    initialization ??= initialize();
  });
  return { src, custom, busy, error, change };
}
