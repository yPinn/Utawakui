<script setup>
// Collection cover: a set coverUrl always wins. Otherwise playlists tile up to 4
// member tracks into a 2x2 collage, but albums never do (one release, one cover;
// see canCollage below) and show the first track full-size. The single source of
// truth for how a playlist/album looks: LibraryEntityDossier.vue (136px dossier)
// and PlaylistSidebarRow.vue (40px row) both render through it, since separate
// implementations had drifted apart.
import { computed } from 'vue';
import { Music2 } from '../../icons/index.js';
import { getTrackInitial } from '../../utils/trackDisplay.js';
import UiArtworkOverlay from './UiArtworkOverlay.vue';

const props = defineProps({
  coverUrl: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  // false for albums: even the no-coverUrl fallback stays a single image
  // (tracks[0]), never a 4-tile grid — an album is one release with one
  // cover. true (the default) is the playlist behavior.
  canCollage: { type: Boolean, default: true },
  size: { type: Number, required: true },
  radius: { type: String, default: undefined },
  background: { type: String, default: undefined },
  color: { type: String, default: undefined },
  uppercase: { type: Boolean, default: true },
  // False when the root shouldn't be aria-hidden — e.g. it wraps a real
  // interactive overlay control (same convention as UiTrackThumb.vue).
  decorative: { type: Boolean, default: true },
  // Glyph for an empty single cover, e.g. a person for artists without a photo.
  emptyIcon: { type: [Object, Function], default: null },
});

const displayTracks = computed(() =>
  props.canCollage ? props.tracks.slice(0, 4) : [],
);
const emptySlotCount = computed(() =>
  Math.max(0, 4 - displayTracks.value.length),
);
const singleTrack = computed(() => (props.canCollage ? null : props.tracks[0]));
const hasArtwork = computed(
  () =>
    Boolean(props.coverUrl) ||
    Boolean(singleTrack.value?.thumbnailUrl) ||
    displayTracks.value.some((track) => track.thumbnailUrl),
);
// Scales with `size` so the same markup reads correctly at both the 136px
// dossier and the 40px sidebar row — a fixed pixel value only ever looked
// right at one of the two sizes.
const cellIconSize = computed(() => Math.max(10, Math.round(props.size / 5.5)));
const singleIconSize = computed(() =>
  Math.max(14, Math.round(props.size / 2.5)),
);
</script>

<template>
  <span
    class="ui-collage-thumb"
    :class="{ 'ui-collage-thumb--folder': !hasArtwork }"
    :aria-hidden="decorative ? 'true' : undefined"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      '--ui-collage-thumb-radius': radius,
      '--ui-collage-thumb-bg': background,
      '--ui-collage-thumb-color': color,
      '--ui-collage-thumb-font-size': `${Math.max(8, Math.round(size / 5))}px`,
      '--ui-collage-thumb-transform': uppercase ? 'uppercase' : 'none',
    }"
  >
    <span class="ui-collage-thumb__layers ui-artwork-composite">
      <img
        v-if="coverUrl"
        class="ui-collage-thumb__custom-image"
        :src="coverUrl"
        alt=""
        draggable="false"
      />
      <template v-else-if="!canCollage">
        <img
          v-if="singleTrack?.thumbnailUrl"
          class="ui-collage-thumb__custom-image"
          :src="singleTrack.thumbnailUrl"
          alt=""
          draggable="false"
        />
        <span v-else-if="singleTrack" class="ui-collage-thumb__single-initial">
          {{ getTrackInitial(singleTrack) }}
        </span>
        <span v-else class="ui-collage-thumb__single-empty">
          <component
            :is="emptyIcon || Music2"
            :size="singleIconSize"
            aria-hidden="true"
          />
        </span>
      </template>
      <template v-else>
        <span
          v-for="track in displayTracks"
          :key="track.id"
          class="ui-collage-thumb__cell"
        >
          <img
            v-if="track.thumbnailUrl"
            class="ui-collage-thumb__image"
            :src="track.thumbnailUrl"
            alt=""
            draggable="false"
          />
          <span v-else>{{ getTrackInitial(track) }}</span>
        </span>
        <span
          v-for="index in emptySlotCount"
          :key="`empty-${index}`"
          class="ui-collage-thumb__cell ui-collage-thumb__cell--empty"
        >
          <Music2 :size="cellIconSize" aria-hidden="true" />
        </span>
      </template>
      <UiArtworkOverlay v-if="$slots.overlay">
        <slot name="overlay" />
      </UiArtworkOverlay>
    </span>
  </span>
</template>

<style scoped>
.ui-collage-thumb {
  position: relative;
  flex: 0 0 auto;
  /* Block-level: an inline root adds a line-box strut below it in block frames. */
  display: grid;
  overflow: hidden;
  border-radius: var(--ui-collage-thumb-radius, var(--ui-radius-sm));
  /* Set once here, not re-read per descendant (see below) — plain
     inheritance is what lets a caller-scope selector (e.g.
     .playlist-sidebar-row--active .playlist-sidebar-row__thumb) override
     this via normal `color` cascade specificity. If every descendant
     instead read the --ui-collage-thumb-color custom property directly,
     that override would silently no-op: the custom property is set via
     this component's own inline style (the color prop below), and an
     inline value always beats a stylesheet rule for the same property,
     regardless of selector specificity. */
  color: var(--ui-collage-thumb-color, var(--ui-color-text));
  user-select: none;
  -webkit-user-drag: none;
}

/* The root is the only radius clip; background, artwork and overlay composite
   here first (see .ui-artwork-composite). */
.ui-collage-thumb__layers {
  /* In flow, filling the root's single grid cell, so size and baseline hold. */
  position: relative;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  background: var(--ui-collage-thumb-bg, var(--ui-color-canvas));
}

/* No artwork: the hairline ring is the edge itself, so it follows the radius
   (a square ring clipped round leaves stray segments). */
.ui-collage-thumb--folder .ui-collage-thumb__layers {
  border-radius: inherit;
  background: linear-gradient(
    180deg,
    var(--ui-color-surface-raised) 0%,
    var(--ui-color-surface) 100%
  );
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-border);
}

.ui-collage-thumb__custom-image {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ui-collage-thumb__single-initial,
.ui-collage-thumb__single-empty {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ui-collage-thumb__single-empty {
  opacity: var(--ui-opacity-muted);
}

.ui-collage-thumb__single-initial {
  font-size: var(--ui-collage-thumb-font-size);
  font-weight: var(--ui-type-label-weight);
  text-transform: var(--ui-collage-thumb-transform, uppercase);
}

.ui-collage-thumb__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  background: var(--ui-collage-thumb-bg, var(--ui-color-surface-hover));
  font-size: var(--ui-collage-thumb-font-size);
  font-weight: var(--ui-type-label-weight);
  text-transform: var(--ui-collage-thumb-transform, uppercase);
  overflow: hidden;
}

/* Decorative checkerboard variation and the empty-slot icon both dim via
   opacity, not a second competing `color` — inherited `color` (above) is
   the one and only color source, so a caller override still reaches every
   cell uniformly instead of these two rules silently reintroducing the
   custom-property trap. */
.ui-collage-thumb__cell:nth-child(2),
.ui-collage-thumb__cell:nth-child(3) {
  background: var(--ui-collage-thumb-bg, var(--ui-color-surface));
  opacity: var(--ui-opacity-muted);
}

.ui-collage-thumb__cell--empty {
  opacity: var(--ui-opacity-muted);
}

.ui-collage-thumb__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
