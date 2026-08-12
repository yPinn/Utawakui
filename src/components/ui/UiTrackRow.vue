<script setup>
// `lead`/`trail` slots cover what differs between callers (a checkbox, a
// status label) without forking the CSS per caller.
import { computed } from 'vue';
import { formatDuration } from '../../utils/format.js';
import { getTrackInitial } from '../../utils/trackDisplay.js';
import UiMarqueeText from './UiMarqueeText.vue';

// Either pass a whole `track` object or the flat props individually — the
// flat props win when both are given, so a caller can override one field
// without reshaping its data.
const props = defineProps({
  track: { type: Object, default: null },
  title: { type: String, default: undefined },
  artist: { type: String, default: undefined },
  active: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  // Lets a caller show its own duration inside #trail (e.g. after other
  // trailing badges) instead of the default duration-then-trail order.
  hideDuration: { type: Boolean, default: false },
});

const displayTitle = computed(() => props.title ?? props.track?.title);
const displayArtist = computed(() => props.artist ?? props.track?.artist);
const displayDuration = computed(() => props.track?.duration);
const thumbnailUrl = computed(() => props.track?.thumbnailUrl);
const displayInitial = computed(() =>
  getTrackInitial({ title: displayTitle.value, id: props.track?.id }),
);
</script>

<template>
  <li
    class="ui-track"
    :class="{
      'ui-track--active': active,
      'ui-track--interactive': interactive,
    }"
  >
    <slot name="lead" />
    <span class="ui-track__thumb" aria-hidden="true">
      <img
        v-if="thumbnailUrl"
        class="ui-track__thumb-image"
        :src="thumbnailUrl"
        alt=""
        draggable="false"
      />
      <span v-else class="ui-track__thumb-fallback">
        {{ displayInitial }}
      </span>
    </span>
    <div class="ui-track__info">
      <UiMarqueeText class="ui-track__title" :text="displayTitle" />
      <span v-if="displayArtist" class="ui-track__artist">{{
        displayArtist
      }}</span>
    </div>
    <span v-if="displayDuration && !hideDuration" class="ui-track__duration">{{
      formatDuration(displayDuration)
    }}</span>
    <slot name="trail" />
  </li>
</template>

<style scoped>
.ui-track {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius);
  font-size: var(--ui-text-sm);
}

.ui-track--interactive {
  cursor: pointer;
}

.ui-track--interactive:hover {
  background: var(--ui-surface-hover);
}

.ui-track--active {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.ui-track--interactive:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-track__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ui-track__thumb {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface-hover);
  color: var(--ui-text);
  font-weight: var(--ui-font-weight-strong);
  overflow: hidden;
  text-transform: uppercase;
  user-select: none;
  -webkit-user-drag: none;
}

.ui-track__thumb-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}

.ui-track__thumb-fallback {
  font-size: var(--ui-text-sm);
}

.ui-track__title {
  color: inherit;
}

.ui-track__artist {
  color: var(--ui-text-muted);
}

.ui-track--active .ui-track__artist {
  color: var(--ui-accent-contrast-muted);
}

.ui-track__duration {
  flex-shrink: 0;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}

.ui-track--active .ui-track__duration {
  color: var(--ui-accent-contrast-muted);
}
</style>
