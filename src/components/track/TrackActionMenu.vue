<script setup>
import { computed } from 'vue';
import {
  Disc3,
  ListEnd,
  ListMinus,
  ListPlus,
  Pencil,
  Plus,
  Tickets,
  Trash2,
} from '../../icons/index.js';
import {
  TRACK_MENU_ACTIONS,
  addToPlaylistTargets,
  playlistDisplayName,
} from '../../utils/playlistMenu.js';
import UiActionMenu from '../ui/UiActionMenu.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  anchor: {
    type: Object,
    default: () => ({ kind: 'point', x: 0, y: 0 }),
    validator: (value) => ['element', 'point'].includes(value?.kind),
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
  canDelete: { type: Boolean, default: false },
  performanceQueueBusy: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'close']);

const eligiblePlaylists = computed(() =>
  addToPlaylistTargets(props.playlists, {
    excludeTrackId: props.track?.id,
  }),
);

const playlistContent = computed(() => ({
  kind: 'filterable-actions',
  search: {
    label: '搜尋播放清單',
    placeholder: '搜尋播放清單',
  },
  pinnedItems: [
    {
      id: 'create-playlist',
      kind: 'action',
      label: '建立新播放清單',
      icon: Plus,
      value: { action: TRACK_MENU_ACTIONS.createPlaylist },
    },
  ],
  groups: [
    {
      id: 'destinations',
      items: eligiblePlaylists.value.map((playlist) => ({
        id: `playlist:${playlist.id}`,
        kind: 'action',
        label: playlistDisplayName(playlist),
        keywords: [playlist.name],
        value: {
          action: TRACK_MENU_ACTIONS.addToPlaylist,
          playlistId: playlist.id,
        },
      })),
    },
  ],
  emptyText: '沒有可加入的播放清單',
  noResultsText: '找不到播放清單',
}));

const content = computed(() => {
  const track = props.track;
  if (!track) {
    return {
      kind: 'actions',
      groups: [],
      emptyText: '沒有可用的操作',
    };
  }

  const isCurrent = props.currentTrackId === track.id;
  const isQueued = props.queuedTrackIds.includes(track.id);
  const groups = [
    {
      id: 'queue',
      items: [
        props.context === 'queued'
          ? {
              id: 'remove-from-queue',
              kind: 'action',
              label: '從一般佇列移除',
              icon: ListMinus,
              value: { action: TRACK_MENU_ACTIONS.removeFromQueue },
            }
          : {
              id: 'add-to-queue',
              kind: 'action',
              label: '加入一般佇列',
              icon: ListEnd,
              disabled: isCurrent || isQueued,
              disabledReason: isCurrent
                ? '現正播放'
                : isQueued
                  ? '已在一般佇列'
                  : '',
              value: { action: TRACK_MENU_ACTIONS.addToQueue },
            },
        {
          id: 'add-to-performance-queue',
          kind: 'action',
          label: '加入演出待唱',
          icon: Tickets,
          disabled: props.performanceQueueBusy,
          value: { action: TRACK_MENU_ACTIONS.addToPerformanceQueue },
        },
      ],
    },
    {
      id: 'playlist',
      items: [
        {
          id: 'add-to-playlist',
          kind: 'submenu',
          label: '加入播放清單',
          icon: ListPlus,
          size: 'lg',
          content: playlistContent.value,
        },
      ],
    },
  ];

  const metadataItems = [];
  if (track.sourceType === 'local-file') {
    metadataItems.push({
      id: 'edit-metadata',
      kind: 'action',
      label: '編輯歌曲',
      icon: Pencil,
      value: { action: TRACK_MENU_ACTIONS.editMetadata },
    });
  }
  if (props.removeFromPlaylistId) {
    metadataItems.push({
      id: 'remove-from-playlist',
      kind: 'action',
      label: '從播放清單移除',
      icon: ListMinus,
      intent: 'danger',
      value: {
        action: TRACK_MENU_ACTIONS.removeFromPlaylist,
        playlistId: props.removeFromPlaylistId,
      },
    });
  }
  if (metadataItems.length > 0) {
    groups.push({ id: 'metadata', items: metadataItems });
  }

  if (props.canGoToAlbum) {
    groups.push({
      id: 'navigation',
      items: [
        {
          id: 'go-to-album',
          kind: 'action',
          label: '前往專輯',
          icon: Disc3,
          value: { action: TRACK_MENU_ACTIONS.goToAlbum },
        },
      ],
    });
  }
  if (props.canDelete) {
    groups.push({
      id: 'destructive',
      items: [
        {
          id: 'delete-track',
          kind: 'action',
          label: '刪除曲目',
          icon: Trash2,
          intent: 'danger',
          value: { action: TRACK_MENU_ACTIONS.deleteTrack },
        },
      ],
    });
  }

  return { kind: 'actions', groups, emptyText: '沒有可用的操作' };
});

function forwardSelect(value, item) {
  emit('select', value, item);
}
</script>

<template>
  <UiActionMenu
    :open="open"
    :anchor="anchor"
    :content="content"
    aria-label="曲目操作"
    @select="forwardSelect"
    @close="emit('close')"
  />
</template>
