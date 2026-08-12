<script setup>
// Shared by PlaylistSidebar.vue's two v-for loops (playlists, albums) — the
// row markup was identical between them before this extraction; drag/drop
// is playlist-only, so those props/events simply go unused (default false)
// for album rows instead of forking the template.
import { Music2, Pause, Play } from '@lucide/vue';
import { ICON_SIZE } from '../constants/ui.js';
import { getTrackInitial } from '../utils/trackDisplay.js';
import UiMarqueeText from './ui/UiMarqueeText.vue';

defineProps({
  playlist: { type: Object, required: true },
  coverTrack: { type: Object, default: undefined },
  subtitle: { type: String, required: true },
  active: { type: Boolean, default: false },
  isActiveSource: { type: Boolean, default: false },
  isPlaying: { type: Boolean, default: false },
  draggable: { type: Boolean, default: false },
  dragging: { type: Boolean, default: false },
  dropBefore: { type: Boolean, default: false },
  dropAfter: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select',
  'contextmenu',
  'togglePlayback',
  'dragstart',
  'dragover',
  'dragleave',
  'drop',
  'dragend',
]);
</script>

<template>
  <button
    type="button"
    class="playlist-sidebar__item"
    :class="{
      'playlist-sidebar__item--active': active,
      'playlist-sidebar__item--dragging': dragging,
      'playlist-sidebar__item--drop-before': dropBefore,
      'playlist-sidebar__item--drop-after': dropAfter,
    }"
    :draggable="draggable"
    :aria-current="active ? 'page' : undefined"
    :title="playlist.name"
    @click="emit('select')"
    @contextmenu="emit('contextmenu', $event)"
    @dragstart="emit('dragstart', $event)"
    @dragover="emit('dragover', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop', $event)"
    @dragend="emit('dragend')"
  >
    <span class="playlist-sidebar__thumb">
      <img
        v-if="coverTrack?.thumbnailUrl"
        class="playlist-sidebar__thumb-image"
        :src="coverTrack.thumbnailUrl"
        alt=""
        aria-hidden="true"
        draggable="false"
      />
      <span v-else-if="coverTrack" aria-hidden="true">{{
        getTrackInitial(coverTrack)
      }}</span>
      <Music2 v-else :size="ICON_SIZE" aria-hidden="true" />
      <button
        type="button"
        class="playlist-sidebar__play"
        :class="{ 'playlist-sidebar__play--active': isActiveSource }"
        :aria-label="
          isPlaying ? `暫停 ${playlist.name}` : `播放 ${playlist.name}`
        "
        :title="isPlaying ? `暫停 ${playlist.name}` : `播放 ${playlist.name}`"
        @click="emit('togglePlayback', $event)"
      >
        <Pause
          v-if="isPlaying"
          :size="ICON_SIZE"
          fill="currentColor"
          aria-hidden="true"
        />
        <Play v-else :size="ICON_SIZE" fill="currentColor" aria-hidden="true" />
      </button>
    </span>
    <span class="playlist-sidebar__info">
      <UiMarqueeText :text="playlist.name || '(未命名歌單)'" />
      <span class="playlist-sidebar__kind">{{ subtitle }}</span>
    </span>
  </button>
</template>

<style scoped>
.playlist-sidebar__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2);
  border: none;
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-text);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
  text-align: left;
  cursor: pointer;
  width: 100%;
}

.playlist-sidebar__item[draggable='true'] {
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}

.playlist-sidebar__item[draggable='true']:active {
  cursor: grabbing;
}

.playlist-sidebar__item--dragging {
  opacity: 0.45;
}

.playlist-sidebar__item--drop-before::before,
.playlist-sidebar__item--drop-after::after {
  content: '';
  position: absolute;
  left: var(--ui-space-2);
  right: var(--ui-space-2);
  height: 2px;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-accent);
  pointer-events: none;
}

.playlist-sidebar__item--drop-before::before {
  top: -3px;
}

.playlist-sidebar__item--drop-after::after {
  bottom: -3px;
}

.playlist-sidebar__item:hover {
  background: var(--ui-surface-hover);
}

.playlist-sidebar__item:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}

.playlist-sidebar__item--active {
  background: var(--ui-accent);
  color: var(--ui-accent-contrast);
}

.playlist-sidebar__thumb {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: calc(var(--ui-radius) - 2px);
  background: var(--ui-surface-hover);
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
  font-weight: var(--ui-font-weight-strong);
  overflow: hidden;
}

.playlist-sidebar__item--active .playlist-sidebar__thumb {
  color: inherit;
  opacity: 0.85;
}

.playlist-sidebar__thumb-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Hidden by default, revealed on row hover/keyboard focus — same idea as
   Spotify's cover-art hover play button. Stays visible without hovering
   once this playlist/album is the loaded queue source, so the currently
   playing/paused row is identifiable at a glance. Semi-transparent black
   works as an overlay over any thumbnail image regardless of the app's own
   light/dark theme, so it isn't themed off --ui-* tokens. */
.playlist-sidebar__play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.1s ease-out;
}

.playlist-sidebar__item:hover .playlist-sidebar__play,
.playlist-sidebar__item:focus-within .playlist-sidebar__play,
.playlist-sidebar__play--active {
  opacity: 1;
}

.playlist-sidebar__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.playlist-sidebar__kind {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
  font-size: var(--ui-text-sm);
}

.playlist-sidebar__item--active .playlist-sidebar__kind {
  color: inherit;
  opacity: 0.75;
}
</style>
