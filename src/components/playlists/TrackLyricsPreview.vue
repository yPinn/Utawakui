<script setup>
import { computed, shallowRef, watch } from 'vue';
import { loadArtworkTone } from '../../utils/artworkTone.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiButton from '../ui/UiButton.vue';

const props = defineProps({
  preview: { type: Object, default: null },
  artworkUrl: { type: String, default: '' },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['open']);

// Reuse the artwork material owner rather than deriving a second palette.
// A request generation prevents a slow previous cover from recolouring the
// current lyrics block after the player has already moved on.
const tone = shallowRef(null);
const visibleLines = computed(() =>
  Array.isArray(props.preview?.lines) ? props.preview.lines.slice(0, 3) : [],
);
let toneRequest = 0;
watch(
  () => props.artworkUrl,
  async (url) => {
    const request = ++toneRequest;
    const next = await loadArtworkTone(url);
    if (request === toneRequest) tone.value = next;
  },
  { immediate: true },
);
</script>

<template>
  <AppRightDockSection
    class="track-lyrics-preview"
    :class="{ 'track-lyrics-preview--themed': tone }"
    :style="tone ? { '--track-lyrics-preview-tone': tone } : undefined"
    heading="歌詞預覽"
    appearance="contained"
    :aria-busy="loading ? 'true' : undefined"
  >
    <template #trailing>
      <UiButton variant="ghost" @click="emit('open')">開啟歌詞</UiButton>
    </template>

    <div class="track-lyrics-preview__lines">
      <p
        v-for="line in visibleLines"
        :key="line.id"
        class="track-lyrics-preview__line"
        :class="{
          'track-lyrics-preview__line--active': line.active,
        }"
        :aria-current="line.active ? 'true' : undefined"
      >
        {{ line.text }}
      </p>
    </div>
  </AppRightDockSection>
</template>

<style scoped>
.track-lyrics-preview,
.track-lyrics-preview__lines {
  min-inline-size: 0;
}

.track-lyrics-preview {
  --track-lyrics-preview-viewport-block-size: calc(
    var(--ui-space-7) + var(--ui-space-5)
  );

  transition: background-color var(--ui-motion-duration-slow)
    var(--ui-motion-easing-standard);
}

/* The cover tone owns this one reading block, like Spotify's lyrics card.
   Cap its lightness before mixing it with the app's darkest neutral so white
   foreground roles keep their contrast in both app themes. */
.track-lyrics-preview--themed {
  --track-lyrics-preview-tone-ground: oklch(
    from var(--track-lyrics-preview-tone) min(l, 0.4) c h
  );
  --ui-right-dock-section-surface-background: color-mix(
    in oklab,
    var(--track-lyrics-preview-tone-ground) 84%,
    var(--ui-palette-neutral-950)
  );
  --ui-color-text: var(--ui-color-overlay-contrast);
  --ui-color-text-muted: color-mix(
    in oklab,
    var(--ui-color-overlay-contrast) 78%,
    var(--track-lyrics-preview-tone-ground)
  );
  --ui-color-border: color-mix(
    in oklab,
    var(--ui-color-overlay-contrast) 28%,
    transparent
  );
  --ui-color-border-strong: color-mix(
    in oklab,
    var(--ui-color-overlay-contrast) 42%,
    transparent
  );
  --ui-color-surface-raised: color-mix(
    in oklab,
    var(--ui-color-overlay-contrast) 12%,
    transparent
  );
  --ui-color-surface-hover: color-mix(
    in oklab,
    var(--ui-color-overlay-contrast) 20%,
    transparent
  );
  --ui-color-surface-active: color-mix(
    in oklab,
    var(--ui-color-overlay-contrast) 28%,
    transparent
  );
  --ui-color-focus: var(--ui-color-overlay-contrast);
}

.track-lyrics-preview__lines {
  min-block-size: var(--track-lyrics-preview-viewport-block-size);
  block-size: var(--track-lyrics-preview-viewport-block-size);
  max-block-size: var(--track-lyrics-preview-viewport-block-size);
  display: grid;
  align-content: start;
  gap: var(--ui-space-2);
  overflow: hidden;
  -webkit-mask-image: linear-gradient(to bottom, currentColor 72%, transparent);
  mask-image: linear-gradient(to bottom, currentColor 72%, transparent);
}

.track-lyrics-preview__line {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  overflow-wrap: anywhere;
  white-space: normal;
}

.track-lyrics-preview__lines .track-lyrics-preview__line--active {
  color: var(--ui-color-text);
}

.track-lyrics-preview__lines {
  -webkit-user-select: none;
  user-select: none;
}
</style>
