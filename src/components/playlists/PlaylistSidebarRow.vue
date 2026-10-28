<script setup>
// Shared by PlaylistSidebar.vue's two v-for loops (playlists, albums) — the
// row markup was identical between them before this extraction; drag/drop
// is playlist-only, so those props/events simply go unused (default false)
// for album rows instead of forking the template.
import { computed } from 'vue';
import { Pause, Play, UserRound } from '../../icons/index.js';
import { PLAYLIST_ROW_THUMB_SIZE } from '../../constants/ui.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import { useTooltip } from '../ui/useTooltip.js';

const props = defineProps({
  playlist: { type: Object, required: true },
  coverUrl: { type: String, default: '' },
  coverTracks: { type: Array, default: () => [] },
  subtitle: { type: String, required: true },
  compact: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  activeSource: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
  playbackEnabled: { type: Boolean, default: true },
  draggable: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  dropBefore: { type: Boolean, default: false },
  dropAfter: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select',
  'contextmenu',
  'togglePlayback',
  'dragStart',
  'dragOver',
  'dragLeave',
  'drop',
  'dragEnd',
]);

const playlistDisplayName = computed(() => props.playlist.name || '未命名歌單');
// Artist rows (ADR 0022) use a round single cover so the collapsed rail still
// tells them apart from square album covers.
const isArtist = computed(() => props.playlist.kind === 'artist');
const selectLabel = computed(() => `選取 ${playlistDisplayName.value}`);
const playbackLabel = computed(
  () => `${props.playing ? '暫停' : '播放'} ${playlistDisplayName.value}`,
);
const dropPosition = computed(() => {
  if (props.dropBefore) return 'before';
  if (props.dropAfter) return 'after';
  return '';
});

const DRAG_EXCLUDED_ACTIONS = '.ui-icon-btn';
let dragStartedFromAction = false;

function isExcludedDragTarget(target) {
  return Boolean(target?.closest?.(DRAG_EXCLUDED_ACTIONS));
}

function handlePointerDown(event) {
  dragStartedFromAction = isExcludedDragTarget(event.target);
}

function resetDragOrigin() {
  dragStartedFromAction = false;
}

function handleDragStart(event) {
  if (dragStartedFromAction || isExcludedDragTarget(event.target)) {
    event.preventDefault();
    resetDragOrigin();
    return;
  }
  emit('dragStart', event);
}

function handleDragEnd(event) {
  resetDragOrigin();
  emit('dragEnd', event);
}

const {
  open: collectionTooltipOpen,
  position: collectionTooltipPosition,
  setTooltip: setCollectionTooltip,
  tooltipId: collectionTooltipId,
  triggerProps: collectionTooltipTriggerProps,
} = useTooltip({
  text: playlistDisplayName,
  placement: 'end',
  disabled: computed(() => !props.compact),
  describedBy: false,
});

function toggleFromArtwork(event) {
  // A double-click dispatches two click events before dblclick. The artwork
  // is already a single-click action, so ignore the second click instead of
  // immediately undoing the first play/pause transition.
  if (event.detail > 1) return;
  emit('togglePlayback', event);
}
</script>

<template>
  <div
    v-bind="collectionTooltipTriggerProps"
    class="playlist-sidebar-row"
    data-artwork-reveal-scope
    :class="{
      'playlist-sidebar-row--active': active,
      'playlist-sidebar-row--current': activeSource,
      'playlist-sidebar-row--artist': isArtist,
      'playlist-sidebar-row--dragging': dragging,
      'playlist-sidebar-row--drop-before': dropBefore,
      'playlist-sidebar-row--drop-after': dropAfter,
    }"
    :draggable="draggable"
    @click="emit('select')"
    @dblclick="playbackEnabled && emit('togglePlayback', $event)"
    @contextmenu="emit('contextmenu', $event)"
    @pointerdown="handlePointerDown"
    @pointerup="resetDragOrigin"
    @pointercancel="resetDragOrigin"
    @dragstart="handleDragStart"
    @dragover="emit('dragOver', $event)"
    @dragleave="emit('dragLeave', $event)"
    @drop="emit('drop', $event)"
    @dragend="handleDragEnd"
  >
    <span class="playlist-sidebar-row__state-surface" aria-hidden="true"></span>
    <button
      type="button"
      class="playlist-sidebar-row__select"
      :aria-current="active ? 'page' : undefined"
      @click.stop="emit('select')"
      @dblclick.stop="playbackEnabled && emit('togglePlayback', $event)"
    >
      <span class="ui-visually-hidden">{{ selectLabel }}</span>
    </button>
    <UiCollageThumb
      class="playlist-sidebar-row__thumb"
      :cover-url="coverUrl"
      :tracks="coverTracks"
      :can-collage="playlist.kind !== 'album' && !isArtist"
      :radius="isArtist ? 'var(--ui-radius-pill)' : undefined"
      :empty-icon="isArtist ? UserRound : null"
      :size="PLAYLIST_ROW_THUMB_SIZE"
      color="var(--ui-color-text-muted)"
      :uppercase="false"
      :decorative="false"
    >
      <template v-if="playbackEnabled" #overlay>
        <UiArtworkReveal>
          <UiIconButton
            :icon="playing ? Pause : Play"
            class="playlist-sidebar-row__play"
            :label="playbackLabel"
            fill
            stretch
            variant="overlay"
            @click.stop="toggleFromArtwork"
            @dblclick.stop
          />
        </UiArtworkReveal>
      </template>
    </UiCollageThumb>
    <span class="playlist-sidebar-row__info">
      <span
        class="playlist-sidebar-row__name"
        :lang="contentLangAttribute(playlist.name, playlist.artist)"
      >
        {{ playlist.name || '(未命名歌單)' }}
      </span>
      <span class="playlist-sidebar-row__kind">{{ subtitle }}</span>
    </span>
    <div
      v-if="$slots.trailing"
      class="playlist-sidebar-row__trailing"
      @click.stop
      @dblclick.stop
    >
      <slot name="trailing" />
    </div>
    <UiSeparator
      v-if="dropPosition"
      tone="accent"
      class="playlist-sidebar-row__drop-indicator"
      :class="`playlist-sidebar-row__drop-indicator--${dropPosition}`"
    />
    <UiTooltipSurface
      :open="collectionTooltipOpen"
      :text="playlistDisplayName"
      :detail="subtitle"
      :tooltip-id="collectionTooltipId"
      :position="collectionTooltipPosition"
      placement="end"
      :set-element="setCollectionTooltip"
    />
  </div>
</template>

<style scoped>
.playlist-sidebar-row {
  position: relative;
  isolation: isolate;
  display: flex;
  min-inline-size: 0;
  align-items: center;
  gap: var(--ui-sidebar-row-gap);
  block-size: var(--ui-sidebar-row-min-height);
  min-height: var(--ui-sidebar-row-min-height);
  padding: var(--ui-sidebar-row-padding-block)
    var(--ui-sidebar-row-padding-inline);
  border: var(--ui-border-width) solid transparent;
  border-radius: var(--ui-side-panel-row-radius);
  background: transparent;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  text-align: left;
  cursor: pointer;
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
}

.playlist-sidebar-row__select {
  position: absolute;
  inset: 0;
  z-index: var(--ui-layer-raised);
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: inherit;
}

.playlist-sidebar-row__state-surface {
  position: absolute;
  inset-block: 0;
  inset-inline: calc(-1 * var(--ui-playlist-row-state-surface-outset-inline));
  z-index: var(--ui-layer-base);
  border: var(--ui-border-width) solid transparent;
  border-radius: inherit;
  background: transparent;
  pointer-events: none;
}

.playlist-sidebar-row[draggable='true'] {
  cursor: grab;
}

.playlist-sidebar-row[draggable='true']:active {
  cursor: grabbing;
}

.playlist-sidebar-row--dragging {
  opacity: var(--ui-opacity-dragging);
}

/* The drop target rises so its gap indicator stays above the neighbour row. */
.playlist-sidebar-row--drop-before,
.playlist-sidebar-row--drop-after {
  z-index: var(--ui-layer-raised);
}

.playlist-sidebar-row__drop-indicator {
  position: absolute;
  inset-inline: 0;
  z-index: var(--ui-layer-indicator);
  pointer-events: none;
}

.playlist-sidebar-row__drop-indicator--before {
  inset-block-start: calc(-0.5 * var(--ui-space-1));
  transform: translateY(-50%);
}

.playlist-sidebar-row__drop-indicator--after {
  inset-block-end: calc(-0.5 * var(--ui-space-1));
  transform: translateY(50%);
}

.playlist-sidebar-row:where(:hover) .playlist-sidebar-row__state-surface {
  background: var(--ui-color-surface-hover);
}

.playlist-sidebar-row__select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.playlist-sidebar-row--active {
  color: var(--ui-color-text);
}

.playlist-sidebar-row--active .playlist-sidebar-row__state-surface {
  border-color: transparent;
  background: var(--ui-sidebar-row-selected-bg);
}

.playlist-sidebar-row:has(.playlist-sidebar-row__select:active)
  .playlist-sidebar-row__state-surface {
  background: var(--ui-color-surface-active);
}

/* The play control is a pure hover affordance: UiArtworkOverlay owns its
   geometry and UiArtworkReveal shows it on row hover (data-artwork-reveal-scope)
   or when the button itself has keyboard focus. Focusing the select action
   does not reveal it, so Enter there never implies playback. */

.playlist-sidebar-row__thumb,
.playlist-sidebar-row__info,
.playlist-sidebar-row__trailing {
  position: relative;
  z-index: var(--ui-layer-overlay);
}

.playlist-sidebar-row__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  opacity: 1;
  visibility: visible;
  transition:
    opacity var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    visibility 0s linear 0s;
}

.playlist-sidebar-row__trailing {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.playlist-sidebar-row__name {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-color-text);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

/* Same title-only coral cue as UiTrackRow/QueueTrackButton's --current —
   this is the loaded playback source, independent of --active (selected
   in the sidebar) and of play/pause (activeSource stays true either way). */
.playlist-sidebar-row--current .playlist-sidebar-row__name {
  color: var(--ui-color-current);
}

.playlist-sidebar-row__kind {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

/* Compact sidebar (see AppPlaylistSidebar.vue's container-type: inline-size
   and the Shell's fixed 64px/256px states) — collapses straight to
   icon-only rather than letting the title/kind text get squeezed and
   clipped. Literal px value, kept in sync by hand with
   --ui-sidebar-compact-threshold in tokens.css since @container
   conditions can't reference custom properties. Range syntax (strict `<`),
   not max-width — the default width equals this threshold, and
   max-width's inclusive `<=` would collapse it to icon-only on every
   fresh launch. */
@container (width < 256px) {
  .playlist-sidebar-row {
    align-self: center;
    justify-content: center;
    gap: 0;
    inline-size: var(--ui-sidebar-row-compact-hit-size);
    block-size: var(--ui-sidebar-row-compact-hit-size);
    min-height: var(--ui-sidebar-row-compact-hit-size);
    padding: var(--ui-sidebar-row-padding-block);
  }

  .playlist-sidebar-row__info {
    flex: 0 0 0;
    inline-size: 0;
    overflow: hidden;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
      visibility 0s linear var(--ui-motion-duration-fast);
  }

  .playlist-sidebar-row__state-surface {
    inset-inline: 0;
  }

  .playlist-sidebar-row__play {
    display: none;
  }

  /* Round artist covers do not carry the current-source dot. */
  .playlist-sidebar-row--current:not(.playlist-sidebar-row--artist)
    .playlist-sidebar-row__thumb::after {
    content: '';
    position: absolute;
    right: var(--ui-space-1);
    top: var(--ui-space-1);
    width: var(--ui-status-dot-size);
    height: var(--ui-status-dot-size);
    border-radius: var(--ui-radius-pill);
    background: var(--ui-color-current);
    box-shadow: 0 0 0 var(--ui-border-width) var(--ui-color-surface);
  }
}

:global(:root[data-ui-motion='reduced'] .playlist-sidebar-row__info) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .playlist-sidebar-row__info {
    transition: none;
  }
}
</style>
