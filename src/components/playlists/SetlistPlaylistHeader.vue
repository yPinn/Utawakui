<script setup>
// Hero (cover + title/rename) and toolbar (play/rename/delete + search) are
// one component, not two — isRenaming/renameValue are read and written by
// both halves, so splitting them would push a rename boolean across two
// sibling components for no benefit.
import { Music2, Pencil, Play, Trash2 } from '@lucide/vue';
import { getTrackInitial } from '../../utils/trackDisplay.js';
import UiButton from '../ui/UiButton.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';

defineProps({
  isAlbum: { type: Boolean, default: false },
  title: { type: String, required: true },
  meta: { type: String, default: '' },
  coverTracks: { type: Array, default: () => [] },
  coverEmptySlots: { type: Number, default: 0 },
  isRenaming: { type: Boolean, default: false },
  renameValue: { type: String, default: '' },
  canPlay: { type: Boolean, default: false },
  searchQuery: { type: String, default: '' },
});

const emit = defineEmits([
  'play',
  'startRename',
  'commitRename',
  'cancelRename',
  'delete',
  'update:renameValue',
  'update:searchQuery',
]);
</script>

<template>
  <section
    class="playlist-hero"
    :aria-label="`${isAlbum ? '專輯' : '播放清單'} ${title}`"
  >
    <div class="playlist-cover" aria-hidden="true">
      <div
        v-for="track in coverTracks"
        :key="track.id"
        class="playlist-cover__cell"
      >
        <img
          v-if="track.thumbnailUrl"
          class="playlist-cover__image"
          :src="track.thumbnailUrl"
          alt=""
          aria-hidden="true"
          draggable="false"
        />
        <span v-else>{{ getTrackInitial(track) }}</span>
      </div>
      <div
        v-for="index in coverEmptySlots"
        :key="index"
        class="playlist-cover__cell playlist-cover__cell--empty"
      >
        <Music2 :size="24" aria-hidden="true" />
      </div>
    </div>

    <div class="playlist-hero__content">
      <p class="playlist-hero__eyebrow">{{ isAlbum ? '專輯' : '播放清單' }}</p>
      <input
        v-if="isRenaming"
        :value="renameValue"
        class="rename-input rename-input--hero"
        autofocus
        aria-label="重新命名播放清單"
        @input="emit('update:renameValue', $event.target.value)"
        @keydown.enter="emit('commitRename')"
        @keydown.esc="emit('cancelRename')"
        @blur="emit('cancelRename')"
      />
      <h1 v-else id="playlist-title" class="playlist-hero__title">
        {{ title }}
      </h1>
      <p class="playlist-hero__meta">{{ meta }}</p>
    </div>
  </section>

  <section class="playlist-toolbar" aria-label="播放清單操作">
    <div class="playlist-toolbar__actions">
      <button
        type="button"
        class="playlist-play"
        :disabled="!canPlay"
        aria-label="播放此歌單"
        title="播放此歌單"
        @click="emit('play')"
      >
        <Play :size="18" fill="currentColor" aria-hidden="true" />
      </button>
      <UiButton
        v-if="!isRenaming"
        :icon="Pencil"
        aria-label="重新命名歌單"
        title="重新命名歌單"
        @click="emit('startRename')"
      />
      <UiButton
        v-if="!isRenaming"
        :icon="Trash2"
        aria-label="刪除歌單"
        title="刪除歌單(不會刪除音檔)"
        @click="emit('delete')"
      />
    </div>

    <div class="playlist-toolbar__tools">
      <UiSearchBox
        :model-value="searchQuery"
        @update:model-value="emit('update:searchQuery', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.playlist-hero {
  display: grid;
  grid-template-columns: 136px minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: end;
  padding: var(--ui-space-5);
  background: var(--ui-color-surface);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
}

.playlist-cover {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  width: 136px;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  border: var(--ui-border-width) solid var(--ui-color-border);
  user-select: none;
  -webkit-user-drag: none;
}

.playlist-cover__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  text-transform: uppercase;
}

.playlist-cover__cell:nth-child(2),
.playlist-cover__cell:nth-child(3) {
  background: var(--ui-color-surface);
  color: var(--ui-color-text-muted);
}

.playlist-cover__cell--empty {
  color: var(--ui-color-text-muted);
}

.playlist-cover__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}

.playlist-hero__content {
  min-width: 0;
}

.playlist-hero__eyebrow {
  margin: 0 0 var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.playlist-hero__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-2xl);
  line-height: 1.05;
  font-weight: var(--ui-font-weight-strong);
  overflow-wrap: anywhere;
}

.playlist-hero__meta {
  margin: var(--ui-space-2) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.playlist-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) 0;
}

.playlist-toolbar__actions,
.playlist-toolbar__tools {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.playlist-toolbar__tools {
  min-width: 0;
}

.playlist-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
  color: var(--ui-color-accent-contrast);
  cursor: pointer;
}

.playlist-play:not(:disabled):hover {
  background: var(--ui-color-accent-hover);
}

.playlist-play:disabled {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.playlist-play:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.rename-input {
  box-sizing: border-box;
  width: 100%;
  max-width: 320px;
  padding: var(--ui-space-1) var(--ui-space-2);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
}

.rename-input--hero {
  max-width: min(520px, 100%);
  font-size: var(--ui-font-size-xl);
}
</style>
