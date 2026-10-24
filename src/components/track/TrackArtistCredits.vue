<script setup>
// A track's artist line where each credited artist opens its artist page
// (ADR 0022). Unpairable credits stay plain text instead of guessing links.
import { computed, shallowRef } from 'vue';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { artistCreditLinks } from '../../utils/artistPage.js';
import UiTextButton from '../ui/UiTextButton.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';

const props = defineProps({
  track: { type: Object, required: true },
  navigable: { type: Boolean, default: true },
});

// `navigate` lets a host surface (e.g. a dialog) dismiss itself first.
const emit = defineEmits(['navigate']);
const overflowOwner = shallowRef(null);
const { state: artistIndexState } = useArtistIndex();
const { jumpToArtist } = useAlbumNavigation();

function openArtist(artistId) {
  emit('navigate', artistId);
  jumpToArtist(artistId);
}

const links = computed(() => {
  if (!props.navigable) {
    const text = props.track.artist ?? '';
    return text ? [{ text, artistId: '' }] : [];
  }
  const paired = artistCreditLinks(props.track, artistIndexState.index);
  if (paired) return paired;
  const text = props.track.artist ?? '';
  return text ? [{ text, artistId: '' }] : [];
});
const fullText = computed(() =>
  links.value.map((link) => link.text).join(', '),
);
const hasTail = computed(() => overflowOwner.value?.hasInlineEndOverflow);

function revealKeyboardFocus(event) {
  const target = event.target;
  if (!target.matches?.(':focus-visible')) return;
  const viewport = overflowOwner.value?.element;
  if (!viewport) return;
  const offset =
    target.getBoundingClientRect().left -
    viewport.getBoundingClientRect().left +
    viewport.scrollLeft;
  // Run after native focus scrolling. Pointer focus must keep its hit box still
  // between mousedown and mouseup so later artist links remain clickable.
  queueMicrotask(() => {
    if (globalThis.document?.activeElement === target) {
      viewport.scrollLeft = offset;
    }
  });
}

function resetAfterFocus(event) {
  const viewport = overflowOwner.value?.element;
  if (viewport && !viewport.contains(event.relatedTarget))
    viewport.scrollLeft = 0;
}
</script>

<template>
  <span
    v-if="links.length > 0"
    class="track-artist-credits"
    :class="{ 'track-artist-credits--overflowing': hasTail }"
    @focusin="revealKeyboardFocus"
    @focusout="resetAfterFocus"
  >
    <UiOverflowTooltip
      ref="overflowOwner"
      class="track-artist-credits__viewport"
      :text="fullText"
    >
      <template v-for="(link, index) in links" :key="`${index}:${link.text}`">
        <span v-if="index > 0" class="track-artist-credits__separator">, </span>
        <UiTextButton
          v-if="link.artistId && navigable"
          class="track-artist-credits__link"
          :text="link.text"
          overflow="ellipsis"
          :aria-label="`前往藝人：${link.text}`"
          @click="openArtist(link.artistId)"
          @dblclick.stop
        />
        <span v-else class="track-artist-credits__text">{{ link.text }}</span>
      </template>
    </UiOverflowTooltip>
    <span
      v-if="hasTail"
      class="track-artist-credits__ellipsis"
      aria-hidden="true"
      >…</span
    >
  </span>
</template>

<style scoped>
/* One viewport owns truncation. Credits retain their intrinsic widths, so
   earlier names never shrink to reserve space for later ones. */
.track-artist-credits {
  position: relative;
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.track-artist-credits :deep(.track-artist-credits__viewport) {
  display: flex;
  align-items: baseline;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.track-artist-credits__link,
.track-artist-credits__text {
  flex: none;
  max-width: none;
}

/* UiTextButton leaves font-weight to its caller. */
.track-artist-credits__link {
  font-weight: inherit;
}

.track-artist-credits__separator {
  flex: none;
  white-space: pre;
}

/* Reserve paint space without changing the measured viewport width. This
   avoids an ellipsis toggling loop when a resized line fits exactly. */
.track-artist-credits--overflowing :deep(.track-artist-credits__viewport) {
  clip-path: inset(0 1em 0 0);
}

.track-artist-credits__ellipsis {
  position: absolute;
  inset-block-start: 0;
  inset-inline-end: 0;
  inline-size: 1em;
  overflow: hidden;
  text-align: end;
  pointer-events: none;
}
</style>
