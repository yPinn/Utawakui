<script setup>
// `lead`/`trail` slots cover what differs between callers (a checkbox, a
// status label) without forking the CSS per caller.
import { computed, shallowRef } from 'vue';
import { formatDuration } from '../../utils/format.js';
import UiMarqueeText from './UiMarqueeText.vue';
import UiOverflowTooltip from './UiOverflowTooltip.vue';
import UiTextButton from './UiTextButton.vue';
import UiTrackThumb from './UiTrackThumb.vue';
import UiTrackArtworkButton from './UiTrackArtworkButton.vue';

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
  // shared quiet selection surface.
  current: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  // Disables owned actions; callers receive the same state through slots.
  disabled: { type: Boolean, default: false },
  // A compound row may contain independently focusable actions without making
  // the entire row one action. Keep its group feedback separate from
  // `interactive`, which owns the full-row button and selection contract.
  stateSurface: { type: Boolean, default: false },
  stateSurfaceActive: { type: Boolean, default: false },
  actionLabel: { type: String, default: undefined },
  // Opt-in only: some interactive rows are commands rather than selectable
  // items, so pressed semantics must never be inferred from `active` alone.
  selectionAction: { type: Boolean, default: false },
  actionDescription: { type: String, default: undefined },
  actionKeyboardShortcuts: { type: String, default: undefined },
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

const emit = defineEmits([
  'titleClick',
  'artworkClick',
  'rowClick',
  'rowDblclick',
  'activate',
  'actionKeydown',
]);

const displayTitle = computed(() => props.title ?? props.track?.title);
const titleOverflowOwner = shallowRef(null);
const displayArtist = computed(() => props.artist ?? props.track?.artist);
const displayDuration = computed(() => props.track?.duration);
const resolvedActionLabel = computed(
  () => props.actionLabel || displayTitle.value || undefined,
);
// title/artist props can override the track's own fields, so the thumb
// initial must derive from displayTitle, not track.title directly.
const thumbTrack = computed(() => ({
  id: props.track?.id,
  title: displayTitle.value,
  thumbnailUrl: props.track?.thumbnailUrl,
}));

function activateFromRowContent(event) {
  if (!props.interactive || props.disabled) return;
  const selection = event.view?.getSelection?.();
  if (selection && !selection.isCollapsed) return;
  emit('rowClick', event);
}

function handleRowClick(event) {
  if (!props.disabled) emit('rowClick', event);
}

function handleRowDblclick(event) {
  if (!props.disabled) emit('rowDblclick', event);
}

function handleActionKeydown(event) {
  if (props.disabled) return;
  emit('actionKeydown', event);
  titleOverflowOwner.value?.triggerProps.onKeydown(event);
  if (event.defaultPrevented || event.key !== 'Enter' || !props.activateOnEnter)
    return;
  event.preventDefault();
  if (!event.repeat) emit('activate', event);
}
</script>

<template>
  <li
    class="ui-track"
    :class="{
      'ui-track--active': active,
      'ui-track--current': current,
      'ui-track--interactive': interactive,
      'ui-track--disabled': disabled,
      'ui-track--state-surface': stateSurface,
      'ui-track--state-surface-active': stateSurfaceActive,
    }"
    :aria-current="current ? 'true' : undefined"
    :aria-disabled="disabled ? 'true' : undefined"
  >
    <button
      v-if="interactive"
      type="button"
      class="ui-track__action"
      :disabled="disabled"
      :aria-label="resolvedActionLabel"
      :aria-description="selectionAction ? actionDescription : undefined"
      :aria-pressed="selectionAction ? active : undefined"
      :aria-keyshortcuts="actionKeyboardShortcuts"
      :aria-describedby="titleOverflowOwner?.triggerProps['aria-describedby']"
      @focusin="titleOverflowOwner?.triggerProps.onFocusin($event)"
      @focusout="titleOverflowOwner?.triggerProps.onFocusout($event)"
      @click="handleRowClick"
      @dblclick="handleRowDblclick"
      @keydown="handleActionKeydown"
    ></button>
    <span
      v-if="$slots.lead"
      class="ui-track__lead"
      @click="activateFromRowContent"
      @dblclick="handleRowDblclick"
    >
      <slot name="lead" :disabled="disabled" />
    </span>
    <UiTrackArtworkButton
      v-if="artworkClickable"
      class="ui-track__artwork-action"
      :disabled="disabled"
      :label="artworkLabel"
      :track="thumbTrack"
      :loading="thumbLoading"
      :decoding="thumbDecoding"
      @activate="emit('artworkClick', $event)"
    >
      <template v-if="$slots.artworkOverlay" #overlay>
        <slot name="artworkOverlay" :disabled="disabled" />
      </template>
    </UiTrackArtworkButton>
    <UiTrackThumb
      v-else
      class="ui-track__thumb"
      :track="thumbTrack"
      size="var(--ui-track-row-thumb-size)"
      :loading="thumbLoading"
      :decoding="thumbDecoding"
    />
    <div
      class="ui-track__info"
      @click="activateFromRowContent"
      @dblclick="handleRowDblclick"
    >
      <UiTextButton
        v-if="titleClickable"
        class="ui-track__title"
        :text="displayTitle"
        :aria-label="titleAriaLabel"
        :overflow="overflow"
        :disabled="disabled"
        @click.stop="!disabled && emit('titleClick')"
        @dblclick.stop
      />
      <UiMarqueeText
        v-else-if="overflow === 'marquee'"
        ref="titleOverflowOwner"
        class="ui-track__title"
        :text="displayTitle"
        :tooltip-enabled="!disabled"
      />
      <UiOverflowTooltip
        v-else
        ref="titleOverflowOwner"
        class="ui-track__title ui-track__title-text"
        :text="displayTitle"
        :tooltip-enabled="!disabled"
      >
        {{ displayTitle }}
      </UiOverflowTooltip>
      <!-- Callers may replace the artist line content (e.g. per-artist
           destinations); the lane, typography and row semantics stay here. -->
      <span v-if="displayArtist" class="ui-track__artist">
        <slot name="artist" :disabled="disabled">{{ displayArtist }}</slot>
      </span>
    </div>
    <span v-if="displayDuration && !hideDuration" class="ui-track__duration">{{
      formatDuration(displayDuration)
    }}</span>
    <span
      v-if="$slots.trail"
      class="ui-track__trail"
      @click="activateFromRowContent"
      @dblclick="handleRowDblclick"
    >
      <slot name="trail" :disabled="disabled" />
    </span>
    <slot name="overlay" :disabled="disabled" />
  </li>
</template>

<style scoped>
.ui-track {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: var(--ui-track-row-gap);
  /* Grid list parents must be able to shrink the row before text ellipsizes. */
  min-inline-size: 0;
  min-height: var(--ui-track-row-min-height);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  border-radius: var(--ui-track-row-radius, var(--ui-radius-md));
  font-size: var(--ui-type-body-compact-size);
}

.ui-track::before {
  content: '';
  position: absolute;
  inset-block: 0;
  inset-inline: calc(-1 * var(--ui-track-row-state-surface-outset-inline));
  z-index: var(--ui-layer-behind);
  border-radius: inherit;
  background: transparent;
  pointer-events: none;
}

.ui-track--interactive {
  cursor: pointer;
}

.ui-track--active {
  color: var(--ui-color-text);
}

.ui-track--active::before {
  background: var(--ui-track-row-selected-background);
}

.ui-track__action {
  position: absolute;
  inset: 0;
  z-index: var(--ui-layer-base);
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.ui-track--interactive:not(.ui-track--active):hover::before {
  background: var(--ui-color-surface-hover);
}

.ui-track--state-surface:not(.ui-track--active):hover::before,
.ui-track--state-surface:not(.ui-track--active):focus-within::before,
.ui-track--state-surface-active:not(.ui-track--active)::before {
  background: var(--ui-color-surface-hover);
}

.ui-track--interactive:has(.ui-track__action:active)::before {
  background: var(--ui-color-surface-active);
}

.ui-track--state-surface:has(button:active)::before {
  background: var(--ui-color-surface-active);
}

.ui-track__action:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.ui-track__lead,
.ui-track__artwork-action,
.ui-track__thumb,
.ui-track__info,
.ui-track__duration,
.ui-track__trail {
  position: relative;
  z-index: var(--ui-layer-raised);
}

.ui-track__lead,
.ui-track__trail {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.ui-track__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

:deep(.ui-track__title) {
  color: inherit;
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

:deep(.ui-track__title-text) {
  display: block;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-track--current :deep(.ui-track__title) {
  color: var(--ui-color-current);
}

.ui-track__artist {
  display: block;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.ui-track__duration {
  flex-shrink: 0;
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}

.ui-track--interactive .ui-track__thumb,
.ui-track--interactive .ui-track__duration {
  pointer-events: none;
}

.ui-track--disabled {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.ui-track--disabled .ui-track__action,
.ui-track--disabled .ui-track__artwork-action {
  cursor: default;
}

/* Disabled wins over hover, focus-within and a transient pressed surface;
   selection remains an independent identity cue. */
.ui-track.ui-track--disabled[aria-disabled='true']::before {
  background: transparent;
}

.ui-track.ui-track--disabled.ui-track--active[aria-disabled='true']::before {
  background: var(--ui-track-row-selected-background);
}

.ui-track--disabled :deep(.ui-marquee__text) {
  max-width: 100%;
  padding-right: 0;
  animation: none;
  will-change: auto;
}

/* The row owns disabled opacity once, including its title action. */
.ui-track--disabled :deep(.ui-text-btn:disabled) {
  opacity: 1;
}
</style>
