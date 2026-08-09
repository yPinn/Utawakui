<script setup>
// `lead`/`trail` slots cover what differs between callers (a checkbox, a
// status label) without forking the CSS per caller.
import { computed } from 'vue';
import { formatDuration } from '../../utils/format.js';

// Either pass a whole `track` object or the flat props individually — the
// flat props win when both are given, so a caller can override one field
// without reshaping its data.
const props = defineProps({
  track: { type: Object, default: null },
  title: { type: String, default: undefined },
  artist: { type: String, default: undefined },
  duration: { type: Number, default: undefined },
  active: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
});

const displayTitle = computed(() => props.title ?? props.track?.title);
const displayArtist = computed(() => props.artist ?? props.track?.artist);
const displayDuration = computed(() => props.duration ?? props.track?.duration);
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
    <div class="ui-track__info">
      <span class="ui-track__title">{{ displayTitle }}</span>
      <span v-if="displayArtist" class="ui-track__artist">{{
        displayArtist
      }}</span>
    </div>
    <span v-if="displayDuration" class="ui-track__duration">{{
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
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}

.ui-track__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ui-track__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-track__artist {
  color: var(--ui-text-muted);
}

.ui-track--active .ui-track__artist {
  color: inherit;
  opacity: 0.75;
}

.ui-track__duration {
  flex-shrink: 0;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}

.ui-track--active .ui-track__duration {
  color: inherit;
  opacity: 0.75;
}
</style>
