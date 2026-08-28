<script setup>
// `lead`/`trail` slots cover what differs between callers (a checkbox, a
// status label) without forking the CSS per caller.
import { computed, ref } from 'vue';
import { formatDuration } from '../../utils/format.js';
import UiMarqueeText from './UiMarqueeText.vue';
import UiTextButton from './UiTextButton.vue';
import UiTrackThumb from './UiTrackThumb.vue';

// Either pass a whole `track` object or the flat props individually — the
// flat props win when both are given, so a caller can override one field
// without reshaping its data.
const props = defineProps({
  track: { type: Object, default: null },
  title: { type: String, default: undefined },
  artist: { type: String, default: undefined },
  active: { type: Boolean, default: false },
  // Currently playing — deliberately separate from `active` (selected).
  // Title-only coral cue, same treatment as QueueTrackButton.vue's
  // .queue-track--current, not the filled surface-selected background.
  current: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  // Lets a caller show its own duration inside #trail (e.g. after other
  // trailing badges) instead of the default duration-then-trail order.
  hideDuration: { type: Boolean, default: false },
  // Swaps the title from plain marquee text to its own click target (e.g.
  // jump to source album — see useAlbumNavigation.js for caller-side logic).
  titleClickable: { type: Boolean, default: false },
  titleAriaLabel: { type: String, default: undefined },
});

const emit = defineEmits(['titleClick']);

const displayTitle = computed(() => props.title ?? props.track?.title);
const displayArtist = computed(() => props.artist ?? props.track?.artist);
const displayDuration = computed(() => props.track?.duration);
// title/artist props can override the track's own fields, so the thumb
// initial must derive from displayTitle, not track.title directly.
const thumbTrack = computed(() => ({
  id: props.track?.id,
  title: displayTitle.value,
  thumbnailUrl: props.track?.thumbnailUrl,
}));

const rootEl = ref(null);

// `@click` is caller-bound attrs fallthrough, not a declared emit, so
// replaying a real click is simpler than adding a parallel event contract.
function handleKeydown(event) {
  if (!props.interactive) return;
  // Skip nested interactive children (titleClickable, lead/trail slots).
  if (event.target !== rootEl.value) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  rootEl.value?.click();
}
</script>

<template>
  <li
    ref="rootEl"
    class="ui-track"
    :class="{
      'ui-track--active': active,
      'ui-track--current': current,
      'ui-track--interactive': interactive,
    }"
    :tabindex="interactive ? 0 : undefined"
    :role="interactive ? 'button' : undefined"
    @keydown="handleKeydown"
  >
    <slot name="lead" />
    <UiTrackThumb
      class="ui-track__thumb"
      :track="thumbTrack"
      size="var(--ui-track-row-thumb-size)"
    />
    <div class="ui-track__info">
      <UiTextButton
        v-if="titleClickable"
        class="ui-track__title"
        :text="displayTitle"
        :aria-label="titleAriaLabel"
        @click="emit('titleClick')"
      />
      <UiMarqueeText v-else class="ui-track__title" :text="displayTitle" />
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
  gap: var(--ui-track-row-gap);
  min-height: var(--ui-track-row-min-height);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-font-size-sm);
}

.ui-track--interactive {
  cursor: pointer;
}

.ui-track--interactive:hover {
  background: var(--ui-color-surface-hover);
}

.ui-track--active {
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
  box-shadow: var(--ui-row-active-shadow);
}

.ui-track--interactive:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-track__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ui-track__title {
  color: inherit;
  font-weight: var(--ui-font-weight-semibold);
}

.ui-track--current .ui-track__title {
  color: var(--ui-color-current);
}

.ui-track__artist {
  color: var(--ui-color-text-muted);
}

.ui-track__duration {
  flex-shrink: 0;
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
