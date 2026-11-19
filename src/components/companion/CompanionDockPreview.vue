<script setup>
import {
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { createCompanionCatalog } from '../../../shared/companionCatalog.mjs';
import CompanionApp from '../../companion/CompanionApp.vue';
import { useCompanionRemote } from '../../composables/useCompanionRemote.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformerSelfView } from '../../composables/usePerformerSelfView.js';

const selfView = usePerformerSelfView();
const { state, latestSnapshot } = selfView;
const { apply } = useCompanionRemote({ selfView });
const library = useLibrary();
const catalog = createCompanionCatalog(() => library.state.tracks);
const screen = useTemplateRef('screen');
const viewportStyle = shallowRef(null);
const PHONE_VIEWPORT_INLINE_SIZE = 390;
let resizeObserver;
let scale = 'near';

function fitViewport() {
  const { width, height } = screen.value.getBoundingClientRect();
  if (!width || !height) return;
  const inlineSize = Math.max(PHONE_VIEWPORT_INLINE_SIZE, width);
  const zoom = width / inlineSize;
  viewportStyle.value = {
    inlineSize: `${inlineSize}px`,
    blockSize: `${height / zoom}px`,
    zoom,
  };
}

onMounted(() => {
  fitViewport();
  resizeObserver = new ResizeObserver(fitViewport);
  resizeObserver.observe(screen.value);
});
onBeforeUnmount(() => resizeObserver?.disconnect());

const remote = {
  performerBridge: {
    getSnapshot: async () => latestSnapshot.value,
    onSnapshot: (listener) => watch(latestSnapshot, listener),
    getWindowState: async () => ({ open: true }),
    onWindowState: () => () => {},
    getReadingScale: async () => scale,
    setReadingScale: async (value) => (scale = value),
  },
  sendCommand: (command, context) =>
    state.remoteReaders > 0
      ? apply({ ...context, command, trackId: context.trackId ?? '' })
      : 'unavailable',
  getCatalog: async ({ query, category, offset }) =>
    catalog(new URLSearchParams({ q: query, category, offset })),
  withThumbnail(track) {
    const thumbnailUrl = library.tracksById.value.get(track?.id)?.thumbnailUrl;
    return thumbnailUrl ? { ...track, thumbnailUrl } : track;
  },
};
</script>

<template>
  <div ref="screen" class="companion-dock-preview">
    <div class="companion-dock-preview__viewport" :style="viewportStyle">
      <CompanionApp status="live" :remote="remote" embedded />
    </div>
  </div>
</template>

<style scoped>
.companion-dock-preview {
  position: relative;
  inline-size: 100%;
  block-size: 100%;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
}

.companion-dock-preview__viewport {
  position: absolute;
  inset-block-start: 0;
  inset-inline-start: 0;
}
</style>
