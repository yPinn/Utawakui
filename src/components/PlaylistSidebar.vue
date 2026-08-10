<script setup>
// Deliberately not built from UiButton for the nav items themselves — same
// reasoning CLAUDE.md gives for AppSidebar.vue's own nav: full-width,
// left-aligned, --ui-text labels, an accent-filled active state. None of
// that matches UiButton's ghost/accent action-button semantics. The
// "新增歌單" affordance below IS a UiButton — it's a real action, not a nav
// item.
import {
  Download,
  FolderPlus,
  ListEnd,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { usePlaylists } from '../composables/usePlaylists.js';
import UiButton from './ui/UiButton.vue';
import UiContextMenu from './ui/UiContextMenu.vue';

const { state, select, create, reorderPlaylist } = usePlaylists();

const emit = defineEmits(['playlistAction']);

const menuContext = ref(null);
const draggingPlaylistId = ref(null);
const dropTargetPlaylistId = ref(null);
const dropPosition = ref(null);

const isMenuOpen = computed(() => Boolean(menuContext.value));
const menuX = computed(() => menuContext.value?.x ?? 0);
const menuY = computed(() => menuContext.value?.y ?? 0);
const menuItems = computed(() => {
  const playlist = menuContext.value?.playlist;
  if (!playlist) return [];

  return [
    {
      key: 'add-to-queue',
      label: '新增至佇列',
      icon: ListEnd,
      disabled: playlist.trackIds.length === 0,
      value: { action: 'add-to-queue', playlistId: playlist.id },
    },
    { key: 'manage-divider', separator: true },
    {
      key: 'edit-details',
      label: '編輯詳細資料',
      icon: Pencil,
      value: { action: 'edit-details', playlistId: playlist.id },
    },
    {
      key: 'delete',
      label: '刪除',
      icon: Trash2,
      danger: true,
      value: { action: 'delete', playlistId: playlist.id },
    },
    {
      key: 'download',
      label: '下載',
      icon: Download,
      status: '尚未支援',
      disabled: true,
      value: { action: 'download', playlistId: playlist.id },
    },
    { key: 'create-divider', separator: true },
    {
      key: 'create-playlist',
      label: '建立播放清單',
      icon: ListPlus,
      value: { action: 'create-playlist' },
    },
    {
      key: 'create-folder',
      label: '建立資料夾',
      icon: FolderPlus,
      status: '尚未支援',
      disabled: true,
      value: { action: 'create-folder' },
    },
  ];
});

function openPlaylistMenu(playlist, event) {
  event.preventDefault();
  event.stopPropagation();
  menuContext.value = { playlist, x: event.clientX, y: event.clientY };
}

function closePlaylistMenu() {
  menuContext.value = null;
}

function selectPlaylist(id) {
  closePlaylistMenu();
  select(id);
}

function handleMenuSelect(value) {
  closePlaylistMenu();
  emit('playlistAction', value);
}

function startDrag(playlist, event) {
  if (state.playlists.length < 2) {
    event.preventDefault();
    return;
  }

  closePlaylistMenu();
  draggingPlaylistId.value = playlist.id;
  dropTargetPlaylistId.value = null;
  dropPosition.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', playlist.id);
  }
}

function updateDropTarget(playlist, event) {
  if (!draggingPlaylistId.value || draggingPlaylistId.value === playlist.id) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  const rect = event.currentTarget.getBoundingClientRect();
  dropTargetPlaylistId.value = playlist.id;
  dropPosition.value =
    event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function leaveDropTarget(playlist, event) {
  if (
    dropTargetPlaylistId.value === playlist.id &&
    !event.currentTarget.contains(event.relatedTarget)
  ) {
    dropTargetPlaylistId.value = null;
    dropPosition.value = null;
  }
}

function dropPlaylist(targetPlaylist, event) {
  event.preventDefault();
  event.stopPropagation();
  const draggedId =
    draggingPlaylistId.value || event.dataTransfer?.getData('text/plain');
  reorderPlaylist(draggedId, targetPlaylist.id, dropPosition.value || 'before');
  clearDragState();
}

function clearDragState() {
  draggingPlaylistId.value = null;
  dropTargetPlaylistId.value = null;
  dropPosition.value = null;
}
</script>

<template>
  <nav class="playlist-sidebar">
    <button
      type="button"
      class="playlist-sidebar__item"
      :class="{ 'playlist-sidebar__item--active': state.selectedId === null }"
      :aria-current="state.selectedId === null ? 'page' : undefined"
      @click="selectPlaylist(null)"
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
        'playlist-sidebar__item--dragging': draggingPlaylistId === playlist.id,
        'playlist-sidebar__item--drop-before':
          dropTargetPlaylistId === playlist.id && dropPosition === 'before',
        'playlist-sidebar__item--drop-after':
          dropTargetPlaylistId === playlist.id && dropPosition === 'after',
      }"
      :draggable="state.playlists.length > 1"
      :aria-current="playlist.id === state.selectedId ? 'page' : undefined"
      :title="playlist.name"
      @click="selectPlaylist(playlist.id)"
      @contextmenu="openPlaylistMenu(playlist, $event)"
      @dragstart="startDrag(playlist, $event)"
      @dragover="updateDropTarget(playlist, $event)"
      @dragleave="leaveDropTarget(playlist, $event)"
      @drop="dropPlaylist(playlist, $event)"
      @dragend="clearDragState"
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

    <UiContextMenu
      :open="isMenuOpen"
      :x="menuX"
      :y="menuY"
      :items="menuItems"
      @select="handleMenuSelect"
      @close="closePlaylistMenu"
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
  position: relative;
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
