<script setup>
// Hero (cover + title/description) and toolbar (play/edit/delete + search)
// are one component, not two — matches the original layout split for no
// benefit in separating further. All editing (name/description/cover) now
// happens through PlaylistDetailsModal.vue, opened via openEditDetails —
// this component is pure display plus the buttons that open that modal.
import { Pencil, Play, Trash2 } from '@lucide/vue';
import UiButton from '../ui/UiButton.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';

defineProps({
  isAlbum: { type: Boolean, default: false },
  title: { type: String, required: true },
  meta: { type: String, default: '' },
  coverTracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  description: { type: String, default: '' },
  canPlay: { type: Boolean, default: false },
  searchQuery: { type: String, default: '' },
});

const emit = defineEmits([
  'play',
  'openEditDetails',
  'delete',
  'update:searchQuery',
]);
</script>

<template>
  <section
    class="playlist-hero"
    :aria-label="`${isAlbum ? '專輯' : '播放清單'} ${title}`"
  >
    <div class="playlist-cover">
      <UiCollageThumb
        :cover-url="coverUrl"
        :tracks="coverTracks"
        :allow-collage="!isAlbum"
        :size="136"
      />
      <!-- Album covers are read-only, normalized from the source's own
           metadata — only playlists (user-authored collections) get an
           edit affordance here, opening the same modal as the toolbar
           pencil below. -->
      <button
        v-if="!isAlbum"
        type="button"
        class="playlist-cover__edit"
        aria-label="編輯詳細資料"
        title="編輯詳細資料"
        @click="emit('openEditDetails')"
      >
        <Pencil :size="16" aria-hidden="true" />
      </button>
    </div>

    <div class="playlist-hero__content">
      <p class="playlist-hero__eyebrow">{{ isAlbum ? '專輯' : '播放清單' }}</p>
      <h1 id="playlist-title" class="playlist-hero__title">
        {{ title }}
      </h1>
      <p class="playlist-hero__meta">{{ meta }}</p>
      <p v-if="description" class="playlist-hero__description">
        {{ description }}
      </p>
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
        :icon="Pencil"
        aria-label="編輯詳細資料"
        title="編輯詳細資料"
        @click="emit('openEditDetails')"
      />
      <UiButton
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

/* Sizing/border/positioning wrapper only — the collage grid itself is
   UiCollageThumb.vue's, shared with PlaylistSidebarRow.vue's nav thumb so
   the two can never show a different image again. */
.playlist-cover {
  position: relative;
  width: 136px;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--ui-radius);
  border: var(--ui-border-width) solid var(--ui-color-border);
}

/* Hover-reveal overlay control, same idiom as PlaylistSidebarRow.vue's
   __play button — semi-transparent black works over any cover image
   regardless of the app's own light/dark theme, so it isn't themed off
   --ui-* tokens. */
.playlist-cover__edit {
  position: absolute;
  right: var(--ui-space-2);
  bottom: var(--ui-space-2);
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--ui-radius-pill);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition: opacity var(--ui-motion-fast) var(--ui-motion-ease);
}

.playlist-cover:hover .playlist-cover__edit,
.playlist-cover:focus-within .playlist-cover__edit {
  opacity: 1;
}

.playlist-cover__edit:focus-visible {
  opacity: 1;
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
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

.playlist-hero__description {
  margin: var(--ui-space-2) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
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
</style>
