<script setup>
// `lead`/`trail` slots cover what differs between callers (a checkbox, a
// status label) without forking the CSS per caller.
import { computed } from 'vue';
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
  // Title-only coral cue shared by standard rows and Queue, not the filled
  // surface-selected background.
  current: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  // Lets a caller show its own duration inside #trail (e.g. after other
  // trailing badges) instead of the default duration-then-trail order.
  hideDuration: { type: Boolean, default: false },
  // Swaps the title from plain marquee text to its own click target (e.g.
  // jump to source album — see useAlbumNavigation.js for caller-side logic).
  titleClickable: { type: Boolean, default: false },
  titleAriaLabel: { type: String, default: undefined },
  // An explicit artwork destination stays separate from the row action.
  // Queue uses it for playback; other consumers may keep artwork decorative.
  artworkClickable: { type: Boolean, default: false },
  artworkLabel: { type: String, default: undefined },
  // Split keyboard semantics for selection-oriented rows: Space follows the
  // row click contract while Enter performs the caller's primary action.
  activateOnEnter: { type: Boolean, default: false },
  overflow: {
    type: String,
    default: 'marquee',
    validator: (value) => ['marquee', 'ellipsis'].includes(value),
  },
  thumbLoading: {
    type: String,
    default: 'eager',
    validator: (value) => ['eager', 'lazy'].includes(value),
  },
  thumbDecoding: {
    type: String,
    default: 'auto',
    validator: (value) => ['auto', 'sync', 'async'].includes(value),
  },
});

const emit = defineEmits(['titleClick', 'artworkClick', 'activate']);

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

// `@click` is caller-bound attrs fallthrough, not a declared emit, so
// replaying a real click is simpler than adding a parallel event contract.
function handleKeydown(event) {
  if (!props.interactive) return;
  // Skip nested interactive children (artwork/title actions, lead/trail slots).
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (event.key === 'Enter' && props.activateOnEnter) {
    emit('activate', event);
    return;
  }
  event.currentTarget.click();
}
</script>

<template>
  <li
    class="ui-track"
    :class="{
      'ui-track--active': active,
      'ui-track--current': current,
      'ui-track--interactive': interactive,
    }"
    :tabindex="interactive ? 0 : undefined"
    :role="interactive ? 'button' : undefined"
    :aria-pressed="interactive ? active : undefined"
    :aria-current="current ? 'true' : undefined"
    @keydown="handleKeydown"
  >
    <slot name="lead" />
    <button
      v-if="artworkClickable"
      type="button"
      class="ui-track__artwork-action"
      @click.stop="emit('artworkClick', $event)"
      @dblclick.stop
    >
      <span class="ui-visually-hidden">{{ artworkLabel }}</span>
      <UiTrackThumb
        class="ui-track__thumb"
        :track="thumbTrack"
        size="var(--ui-track-row-thumb-size)"
        :loading="thumbLoading"
        :decoding="thumbDecoding"
      />
      <slot name="artworkOverlay" />
    </button>
    <UiTrackThumb
      v-else
      class="ui-track__thumb"
      :track="thumbTrack"
      size="var(--ui-track-row-thumb-size)"
      :loading="thumbLoading"
      :decoding="thumbDecoding"
    />
    <div class="ui-track__info">
      <UiTextButton
        v-if="titleClickable"
        class="ui-track__title"
        :text="displayTitle"
        :aria-label="titleAriaLabel"
        :overflow="overflow"
        @click="emit('titleClick')"
      />
      <UiMarqueeText
        v-else-if="overflow === 'marquee'"
        class="ui-track__title"
        :text="displayTitle"
      />
      <span
        v-else
        class="ui-track__title ui-track__title-text"
        :title="displayTitle"
      >
        {{ displayTitle }}
      </span>
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
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: var(--ui-track-row-gap);
  min-height: var(--ui-track-row-min-height);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-font-size-sm);
}

.ui-track::before {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline: calc(-1 * var(--ui-track-row-state-surface-outset-inline));
  z-index: -1;
  border-radius: inherit;
  background: transparent;
  pointer-events: none;
}

.ui-track--interactive {
  cursor: pointer;
}

.ui-track--interactive:hover::before {
  background: var(--ui-color-surface-hover);
}

.ui-track--active {
  color: var(--ui-color-text);
}

.ui-track--active::before {
  background: var(--ui-color-surface-selected);
  box-shadow: var(--ui-row-active-shadow);
}

.ui-track--interactive:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-track__artwork-action {
  position: relative;
  width: var(--ui-track-row-thumb-size);
  height: var(--ui-track-row-thumb-size);
  flex: 0 0 var(--ui-track-row-thumb-size);
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.ui-track__artwork-action:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
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
  line-height: var(--ui-line-height-label);
}

.ui-track__title-text {
  display: block;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-track--current .ui-track__title {
  color: var(--ui-color-current);
}

.ui-track__artist {
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.ui-track__duration {
  flex-shrink: 0;
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
