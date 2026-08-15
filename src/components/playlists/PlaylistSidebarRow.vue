<script setup>
// Shared by PlaylistSidebar.vue's two v-for loops (playlists, albums) — the
// row markup was identical between them before this extraction; drag/drop
// is playlist-only, so those props/events simply go unused (default false)
// for album rows instead of forking the template.
import { Pause, Play } from '../../icons/index.js';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';

defineProps({
  playlist: { type: Object, required: true },
  coverUrl: { type: String, default: '' },
  coverTracks: { type: Array, default: () => [] },
  subtitle: { type: String, required: true },
  active: { type: Boolean, default: false },
  activeSource: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
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
</script>

<template>
  <div
    class="playlist-sidebar-row"
    :class="{
      'playlist-sidebar-row--active': active,
      'playlist-sidebar-row--current': activeSource,
      'playlist-sidebar-row--dragging': dragging,
      'playlist-sidebar-row--drop-before': dropBefore,
      'playlist-sidebar-row--drop-after': dropAfter,
    }"
    :draggable="draggable"
    :title="playlist.name"
    @click="emit('select')"
    @contextmenu="emit('contextmenu', $event)"
    @dragstart="emit('dragStart', $event)"
    @dragover="emit('dragOver', $event)"
    @dragleave="emit('dragLeave', $event)"
    @drop="emit('drop', $event)"
    @dragend="emit('dragEnd')"
  >
    <button
      type="button"
      class="playlist-sidebar-row__select"
      :aria-current="active ? 'page' : undefined"
      :aria-label="`選取 ${playlist.name || '未命名歌單'}`"
      :title="playlist.name"
      @click.stop="emit('select')"
    />
    <UiCollageThumb
      class="playlist-sidebar-row__thumb"
      :cover-url="coverUrl"
      :tracks="coverTracks"
      :can-collage="playlist.kind !== 'album'"
      :size="40"
      color="var(--ui-color-text-muted)"
      :uppercase="false"
      :decorative="false"
    >
      <template #overlay>
        <UiIconButton
          :icon="playing ? Pause : Play"
          class="playlist-sidebar-row__play"
          :label="playing ? `暫停 ${playlist.name}` : `播放 ${playlist.name}`"
          :title="playing ? `暫停 ${playlist.name}` : `播放 ${playlist.name}`"
          fill
          shape="inherit"
          variant="overlay"
          @click.stop="emit('togglePlayback', $event)"
        />
      </template>
    </UiCollageThumb>
    <span class="playlist-sidebar-row__info">
      <UiMarqueeText
        class="playlist-sidebar-row__name"
        :text="playlist.name || '(未命名歌單)'"
      />
      <span class="playlist-sidebar-row__kind">{{ subtitle }}</span>
    </span>
  </div>
</template>

<style scoped>
.playlist-sidebar-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-playlist-row-gap);
  min-height: var(--ui-playlist-row-min-height);
  padding: var(--ui-playlist-row-padding-block)
    var(--ui-playlist-row-padding-inline);
  border: var(--ui-border-width) solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  text-align: left;
  cursor: pointer;
  width: 100%;
}

.playlist-sidebar-row__select {
  position: absolute;
  inset: 0;
  z-index: 1;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: inherit;
}

.playlist-sidebar-row[draggable='true'] {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.playlist-sidebar-row[draggable='true']:active {
  cursor: grabbing;
}

.playlist-sidebar-row--dragging {
  opacity: var(--ui-opacity-dragging);
}

.playlist-sidebar-row--drop-before::before,
.playlist-sidebar-row--drop-after::after {
  content: '';
  position: absolute;
  left: var(--ui-space-2);
  right: var(--ui-space-2);
  height: 2px;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  pointer-events: none;
}

.playlist-sidebar-row--drop-before::before {
  top: -3px;
}

.playlist-sidebar-row--drop-after::after {
  bottom: -3px;
}

.playlist-sidebar-row:hover {
  border-color: var(--ui-color-border);
  background: var(--ui-color-surface-hover);
}

.playlist-sidebar-row__select:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.playlist-sidebar-row--active {
  border-color: var(--ui-color-border-strong);
  background: var(--ui-color-surface-selected);
  color: var(--ui-color-text);
  box-shadow: var(--ui-row-active-shadow);
}

.playlist-sidebar-row--active .playlist-sidebar-row__thumb {
  color: var(--ui-color-accent);
}

/* Hidden by default, revealed on row hover/keyboard focus only — same idea
   as Spotify's cover-art hover play button. No longer forced visible for
   the active-playback-source row: --ui-color-current on
   .playlist-sidebar-row__name now carries that "identifiable at a glance"
   job, so the mask can stay a pure hover affordance. Semi-transparent black
   works as an overlay over any thumbnail image regardless of the app's own
   light/dark theme, so it isn't themed off --ui-* tokens. */
.playlist-sidebar-row__play {
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  border-radius: inherit;
  opacity: 0;
  transition: opacity var(--ui-motion-fast) var(--ui-motion-ease);
}

/* :focus-visible, not :focus-within — the hidden select button can keep
   focus after mouse selection. :focus-visible only matches keyboard-driven
   focus, which is the actual accessibility case this is for. */
.playlist-sidebar-row__thumb:hover .playlist-sidebar-row__play,
.playlist-sidebar-row__select:focus-visible
  ~ .playlist-sidebar-row__thumb
  .playlist-sidebar-row__play {
  opacity: 1;
}

.playlist-sidebar-row__thumb,
.playlist-sidebar-row__info {
  position: relative;
  z-index: 2;
}

.playlist-sidebar-row__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.playlist-sidebar-row__name {
  font-weight: var(--ui-font-weight-strong);
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
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

/* Compact sidebar (see AppPlaylistSidebar.vue's container-type: inline-size
   and useSidebarResize.js's snap-to-min behavior) — collapses straight to
   icon-only rather than letting the title/kind text get squeezed and
   clipped. Literal px value, kept in sync by hand with
   --ui-playlist-sidebar-compact-threshold in tokens.css since @container
   conditions can't reference custom properties. Range syntax (strict `<`),
   not max-width — the default width equals this threshold, and
   max-width's inclusive `<=` would collapse it to icon-only on every
   fresh launch. */
@container (width < 256px) {
  .playlist-sidebar-row__info {
    display: none;
  }
}
</style>
