<script setup>
// Deliberately not built from UiButton for the nav items themselves — same
// reasoning CLAUDE.md gives for AppSidebar.vue's own nav: full-width,
// left-aligned, --ui-text labels, an accent-filled active state. None of
// that matches UiButton's ghost/accent action-button semantics. The
// "新增歌單" affordance below IS a UiButton — it's a real action, not a nav
// item.
import { Plus } from '@lucide/vue';
import { usePlaylists } from '../composables/usePlaylists.js';
import UiButton from './ui/UiButton.vue';

const { state, select, create } = usePlaylists();
</script>

<template>
  <nav class="playlist-sidebar">
    <button
      type="button"
      class="playlist-sidebar__item"
      :class="{ 'playlist-sidebar__item--active': state.selectedId === null }"
      :aria-current="state.selectedId === null ? 'page' : undefined"
      @click="select(null)"
    >
      <span class="playlist-sidebar__label">全部曲目</span>
    </button>

    <button
      v-for="playlist in state.playlists"
      :key="playlist.id"
      type="button"
      class="playlist-sidebar__item"
      :class="{
        'playlist-sidebar__item--active': playlist.id === state.selectedId,
      }"
      :aria-current="playlist.id === state.selectedId ? 'page' : undefined"
      :title="playlist.name"
      @click="select(playlist.id)"
    >
      <span class="playlist-sidebar__label">{{
        playlist.name || '(未命名歌單)'
      }}</span>
      <span class="playlist-sidebar__count">{{
        playlist.trackIds.length
      }}</span>
    </button>

    <UiButton
      :icon="Plus"
      class="playlist-sidebar__add"
      aria-label="新增歌單"
      title="新增歌單"
      @click="create()"
    />
  </nav>
</template>

<style scoped>
.playlist-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.playlist-sidebar__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: none;
  border-radius: var(--ui-radius);
  background: transparent;
  color: var(--ui-text);
  font-family: var(--font-ui);
  font-size: var(--ui-text-sm);
  text-align: left;
  cursor: pointer;
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

.playlist-sidebar__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.playlist-sidebar__count {
  flex-shrink: 0;
  color: var(--ui-text-muted);
  font-variant-numeric: tabular-nums;
}

.playlist-sidebar__item--active .playlist-sidebar__count {
  color: inherit;
  opacity: 0.75;
}

.playlist-sidebar__add {
  width: 100%;
  justify-content: center;
}
</style>
