<script setup>
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import PerformerLyricCue from '../components/performer/PerformerLyricCue.vue';
import { t } from '../utils/i18n.js';
import { scrollToLyric } from '../utils/lyricsReaderScroll.js';

const props = defineProps({
  frame: { type: Object, required: true },
  snapshot: { type: Object, default: null },
  layout: { type: String, required: true },
  readingScale: { type: String, required: true },
});

const following = defineModel('following', { type: Boolean, default: true });
const viewport = useTemplateRef('viewport');
const readerHeight = shallowRef(0);
const trackId = computed(() => props.frame.trackId);
const positionedIndex = computed(() => props.frame.positionedLineIndex ?? -1);
const documentKey = computed(() => {
  const source = props.snapshot?.state?.lyrics?.source;
  return JSON.stringify([
    trackId.value,
    source?.kind,
    source?.language,
    source?.label,
  ]);
});
const readingVariant = computed(() => props.frame.readingVariant);
const rows = computed(() => {
  const lyrics = props.snapshot?.state?.lyrics;
  if (!trackId.value || lyrics?.trackId !== trackId.value) return [];
  const readings = props.snapshot?.readings?.lines;
  return lyrics.lines.flatMap((line, index) =>
    line.text.trim()
      ? [
          {
            line,
            index,
            reading: selectReading(readings?.[index], readingVariant.value),
          },
        ]
      : [],
  );
});
const lines = computed(() => {
  const items = rows.value;
  if (props.layout === 'list') return items;
  const current = items.findIndex(
    ({ index }) => index === props.frame.currentLineIndex,
  );
  return items.slice(Math.max(0, current), Math.max(0, current) + 2);
});
const emptyLabel = computed(() =>
  t(
    props.frame.trackId
      ? 'companion.lyrics.noLyrics'
      : 'companion.lyrics.noTrack',
  ),
);

function selectReading(line, variant) {
  if (!line) return null;
  if (variant === 'furigana') return { segments: line.segments };
  if (variant === 'romaji') return { romaji: line.romaji };
  return null;
}

function alignCurrent(container, behavior) {
  if (!container || !following.value) return;
  const current = container.querySelector(
    '[data-lyric-anchor] .performer-lyric-cue__text',
  );
  if (props.layout !== 'list' || !current) {
    container.scrollTop = 0;
    return;
  }
  scrollToLyric(container, current, behavior);
}

function pauseFollowing() {
  if (props.layout === 'list' && positionedIndex.value >= 0)
    following.value = false;
}

let touchStart = null;
function startBrowsing(event) {
  touchStart = event.touches.length === 1 ? event.touches[0] : null;
}

function browse(event) {
  if (!touchStart || event.touches.length !== 1) return;
  const [touch] = event.touches;
  const dy = Math.abs(touch.clientY - touchStart.clientY);
  if (dy > 8 && dy > Math.abs(touch.clientX - touchStart.clientX)) {
    touchStart = null;
    pauseFollowing();
  }
}

const scrollKeys = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);
function browseWithKeyboard(event) {
  if (scrollKeys.has(event.key)) pauseFollowing();
}

watch([documentKey, () => props.layout], () => (following.value = true));
watch(
  [
    viewport,
    documentKey,
    positionedIndex,
    () => props.layout,
    () => props.readingScale,
    readingVariant,
    following,
  ],
  (
    [container, key, index],
    [previousContainer, previousKey, previousIndex],
  ) => {
    const smooth =
      container === previousContainer &&
      key === previousKey &&
      previousIndex >= 0 &&
      index === previousIndex + 1;
    alignCurrent(container, smooth ? 'smooth' : 'instant');
  },
  { flush: 'post' },
);

watch(viewport, (container, _, onCleanup) => {
  if (!container) return;
  readerHeight.value = container.clientHeight;
  if (typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(() => {
    readerHeight.value = container.clientHeight;
    alignCurrent(container, 'instant');
  });
  observer.observe(container);
  onCleanup(() => observer.disconnect());
});
</script>

<template>
  <div
    v-if="lines.length"
    ref="viewport"
    class="companion-lyrics"
    :class="{
      'companion-lyrics--focus': layout === 'focus',
      'companion-lyrics--timed': snapshot?.state?.lyrics?.synced,
    }"
    :data-reading-scale="readingScale"
    :style="{ '--companion-lyric-tail': `${(readerHeight * 2) / 3}px` }"
    role="region"
    :aria-label="t('companion.tabs.lyrics')"
    tabindex="0"
    @wheel.passive="pauseFollowing"
    @touchstart.passive="startBrowsing"
    @touchmove.passive="browse"
    @keydown.self="browseWithKeyboard"
  >
    <div
      v-for="{ line, index, reading } in lines"
      :key="index"
      v-memo="[
        line.text,
        reading?.romaji,
        reading?.segments,
        frame.lyricsLanguage,
        layout,
        index === positionedIndex,
        snapshot?.vocalRoles?.[index],
      ]"
      :data-lyric-anchor="index === positionedIndex ? '' : undefined"
      :aria-current="index === positionedIndex ? 'true' : undefined"
    >
      <PerformerLyricCue
        :line="line"
        :reading="reading"
        :language="frame.lyricsLanguage || 'und'"
        :current="index === positionedIndex"
        line-marker
        :vocal-role="snapshot?.vocalRoles?.[index]"
      />
    </div>
  </div>
  <p v-else class="companion-lyrics__empty">{{ emptyLabel }}</p>
</template>

<style scoped>
.companion-lyrics {
  --ui-performer-secondary-foreground: var(--ui-color-text-muted);
  --ui-lyrics-marker-height: var(--ui-space-3);
  --companion-lyric-font-size: var(--ui-type-title-size);
  --ui-performer-cue-current-font-size: var(--companion-lyric-font-size);
  --ui-performer-cue-next-font-size: var(--companion-lyric-font-size);
  --ui-performer-reading-font-size: var(--ui-type-body-compact-size);
  --ui-performer-next-ruby-font-size: var(--ui-performer-reading-font-size);
  --ui-performer-ruby-font-size: var(--ui-performer-reading-font-size);
  --ui-performer-cue-align: start;
  --ui-performer-cue-wrap: wrap;
  --ui-performer-cue-next-weight: var(--ui-font-weight-semibold);
  --ui-performer-cue-current-weight: var(--ui-performer-cue-next-weight);

  box-sizing: border-box;
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
  block-size: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  touch-action: pan-y pinch-zoom;
  padding: var(--ui-space-3);
  scrollbar-gutter: stable;
}

.companion-lyrics--timed:not(.companion-lyrics--focus)::after {
  content: '';
  block-size: var(--companion-lyric-tail);
}

.companion-lyrics:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.companion-lyrics[data-reading-scale='desk'] {
  --companion-lyric-font-size: var(--ui-type-heading-size);
  --ui-performer-reading-font-size: var(--ui-type-body-size);
}

.companion-lyrics[data-reading-scale='stage'] {
  --companion-lyric-font-size: var(--ui-type-display-size);
  --ui-performer-reading-font-size: var(--ui-type-title-size);
}

.companion-lyrics--focus {
  align-content: safe center;
}

.companion-lyrics__empty {
  margin: 0;
  padding: var(--ui-space-4) var(--ui-space-3);
  text-align: center;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
}
</style>
