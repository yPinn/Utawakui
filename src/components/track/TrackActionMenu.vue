<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  Disc3,
  ListEnd,
  ListMinus,
  ListPlus,
  Pencil,
  Plus,
} from '../../icons/index.js';
import {
  TRACK_MENU_ACTIONS,
  addToPlaylistTargets,
  filterPlaylistTargets,
  playlistDisplayName,
} from '../../utils/playlistMenu.js';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  alignX: {
    type: String,
    default: 'left',
    validator: (value) => ['left', 'right'].includes(value),
  },
  track: { type: Object, default: null },
  context: {
    type: String,
    default: 'default',
    validator: (value) =>
      ['default', 'current', 'queued', 'source', 'recent'].includes(value),
  },
  playlists: { type: Array, default: () => [] },
  currentTrackId: { type: String, default: '' },
  queuedTrackIds: { type: Array, default: () => [] },
  removeFromPlaylistId: { type: String, default: '' },
  canGoToAlbum: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'close']);
const playlistQuery = shallowRef('');

const eligiblePlaylists = computed(() =>
  addToPlaylistTargets(props.playlists, {
    excludeTrackId: props.track?.id,
  }),
);
const visiblePlaylists = computed(() =>
  filterPlaylistTargets(eligiblePlaylists.value, playlistQuery.value),
);
const playlistEmptyText = computed(() =>
  eligiblePlaylists.value.length === 0
    ? '沒有可加入的播放清單'
    : '找不到播放清單',
);

const playlistChildren = computed(() => {
  const children = [
    {
      key: 'create-playlist',
      label: '新增歌單',
      icon: Plus,
      value: { action: TRACK_MENU_ACTIONS.createPlaylist },
    },
    { key: 'playlist-divider', separator: true },
  ];

  children.push(
    ...visiblePlaylists.value.map((playlist) => ({
      key: playlist.id,
      label: playlistDisplayName(playlist),
      value: {
        action: TRACK_MENU_ACTIONS.addToPlaylist,
        playlistId: playlist.id,
      },
    })),
  );
  return children;
});

const items = computed(() => {
  const track = props.track;
  if (!track) return [];

  const isCurrent = props.currentTrackId === track.id;
  const isQueued = props.queuedTrackIds.includes(track.id);
  const menuItems = [
    props.context === 'queued'
      ? {
          key: 'remove-from-queue',
          label: '從佇列移除',
          icon: ListMinus,
          value: { action: TRACK_MENU_ACTIONS.removeFromQueue },
        }
      : {
          key: 'add-to-queue',
          label: '加入佇列',
          icon: ListEnd,
          status: isCurrent ? '現正播放' : isQueued ? '已在佇列' : '',
          disabled: isCurrent || isQueued,
          value: { action: TRACK_MENU_ACTIONS.addToQueue },
        },
    { key: 'queue-divider', separator: true },
    {
      key: 'add-to-playlist',
      label: '加入播放清單',
      icon: ListPlus,
      children: playlistChildren.value,
      submenuWidth: 220,
    },
  ];

  const metadataItems = [];
  if (track.sourceType === 'local-file') {
    metadataItems.push({
      key: 'edit-metadata',
      label: '編輯資訊',
      icon: Pencil,
      value: { action: TRACK_MENU_ACTIONS.editMetadata },
    });
  }
  if (props.removeFromPlaylistId) {
    metadataItems.push({
      key: 'remove-from-playlist',
      label: '從播放清單移除',
      icon: ListMinus,
      value: {
        action: TRACK_MENU_ACTIONS.removeFromPlaylist,
        playlistId: props.removeFromPlaylistId,
      },
    });
  }
  if (metadataItems.length > 0) {
    menuItems.push(
      { key: 'metadata-divider', separator: true },
      ...metadataItems,
    );
  }

  if (props.canGoToAlbum) {
    menuItems.push(
      { key: 'navigation-divider', separator: true },
      {
        key: 'go-to-album',
        label: '前往專輯',
        icon: Disc3,
        value: { action: TRACK_MENU_ACTIONS.goToAlbum },
      },
    );
  }
  return menuItems;
});

watch([() => props.open, () => props.track?.id], () => {
  playlistQuery.value = '';
});

function forwardSelect(value, item) {
  emit('select', value, item);
}
</script>

<template>
  <UiContextMenu
    :open="open"
    :x="x"
    :y="y"
    :align-x="alignX"
    :items="items"
    aria-label="曲目操作"
    empty-text="沒有可用的操作"
    @select="forwardSelect"
    @close="emit('close')"
  >
    <template #submenu-leading="{ item }">
      <UiSearchBox
        v-if="item.key === 'add-to-playlist'"
        v-model="playlistQuery"
        class="track-action-menu__search"
        label="搜尋播放清單"
        placeholder="搜尋播放清單"
      />
    </template>
    <template #submenu-trailing="{ item }">
      <p
        v-if="item.key === 'add-to-playlist' && visiblePlaylists.length === 0"
        class="track-action-menu__empty"
      >
        {{ playlistEmptyText }}
      </p>
    </template>
  </UiContextMenu>
</template>

<style scoped>
.track-action-menu__search {
  min-width: 0;
  margin-block-end: var(--ui-space-1);
}

.track-action-menu__empty {
  min-height: var(--ui-menu-item-height);
  display: flex;
  align-items: center;
  margin: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}
</style>
