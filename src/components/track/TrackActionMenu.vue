<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useReleaseOrganization } from '../../composables/useReleaseOrganization.js';
import { useReleaseCatalog } from '../../composables/useReleaseCatalog.js';
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import {
  Disc3,
  ListEnd,
  ListMinus,
  ListPlus,
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
import { t } from '../../utils/i18n.js';

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
      ['default', 'current', 'queued', 'source', 'recent', 'editor'].includes(
        value,
      ),
  },
  playlists: { type: Array, default: () => [] },
  currentTrackId: { type: String, default: '' },
  queuedTrackIds: { type: Array, default: () => [] },
  removeFromPlaylistId: { type: String, default: '' },
  canGoToAlbum: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  performanceQueueBusy: { type: Boolean, default: false },
  releaseContextId: { type: String, default: '' },
  canUnlinkWork: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'close']);
const containingReleases = shallowRef([]);
const releaseLoading = shallowRef(false);
const releaseError = shallowRef(false);
watch(
  [() => props.open, () => props.track?.id],
  async ([open, trackId], _old, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    containingReleases.value = [];
    releaseError.value = false;
    if (!open || !trackId || !globalThis.window?.Utawakui?.getTrackReleases) {
      releaseLoading.value = false;
      return;
    }
    releaseLoading.value = true;
    try {
      const result = await useReleaseOrganization().findTrackReleases(trackId);
      if (!current) return;
      if (result?.status === 'ok')
        containingReleases.value = result.releases ?? [];
      else releaseError.value = true;
    } catch {
      if (current) releaseError.value = true;
    } finally {
      if (current) releaseLoading.value = false;
    }
  },
  { immediate: true },
);

const eligiblePlaylists = computed(() =>
  addToPlaylistTargets(props.playlists, {
    excludeTrackId: props.track?.id,
  }),
);

const playlistContent = computed(() => ({
  kind: 'filterable-actions',
  search: {
    label: t('track.menu.searchPlaylists'),
    placeholder: t('track.menu.searchPlaylists'),
  },
  pinnedItems: [
    {
      id: 'create-playlist',
      kind: 'action',
      label: t('track.menu.newPlaylist'),
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
  emptyText: t('track.menu.noPlaylists'),
  noResultsText: t('track.menu.noPlaylistMatch'),
}));

const content = computed(() => {
  const track = props.track;
  if (!track) {
    return {
      kind: 'actions',
      groups: [],
      emptyText: t('track.menu.noActions'),
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
              label: t('track.menu.removeFromQueue'),
              icon: ListMinus,
              value: { action: TRACK_MENU_ACTIONS.removeFromQueue },
            }
          : {
              id: 'add-to-queue',
              kind: 'action',
              label: t('track.menu.addToQueue'),
              icon: ListEnd,
              disabled: isCurrent || isQueued,
              disabledReason: isCurrent
                ? t('track.menu.nowPlaying')
                : isQueued
                  ? t('track.menu.inQueue')
                  : '',
              value: { action: TRACK_MENU_ACTIONS.addToQueue },
            },
        {
          id: 'add-to-performance-queue',
          kind: 'action',
          label: t('track.menu.addToArrangement'),
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
          label: t('track.menu.addToPlaylist'),
          icon: ListPlus,
          size: 'lg',
          content: playlistContent.value,
        },
      ],
    },
  ];

  const metadataItems =
    props.context === 'editor'
      ? []
      : [
          {
            id: 'work-organization',
            kind: 'action',
            label: t('track.menu.organize'),
            icon: Disc3,
            value: { action: TRACK_MENU_ACTIONS.workOrganization },
          },
        ];
  metadataItems.push({
    id: 'supplement-release',
    kind: 'action',
    label: t('track.menu.completeAlbum'),
    icon: Disc3,
    value: { action: 'supplement-release' },
  });
  if (track.sourceType === 'local-file' && props.context !== 'editor') {
    metadataItems.push({
      id: 'create-local-release',
      kind: 'action',
      label: t('track.menu.createSingle'),
      icon: Plus,
      value: { action: TRACK_MENU_ACTIONS.createLocalRelease },
    });
  }
  if (props.canUnlinkWork)
    metadataItems.push({
      id: 'unlink-work',
      kind: 'action',
      label: t('track.menu.unlink'),
      icon: ListMinus,
      value: { action: TRACK_MENU_ACTIONS.unlinkWork },
    });
  if (props.removeFromPlaylistId) {
    metadataItems.push({
      id: 'remove-from-playlist',
      kind: 'action',
      label: t('track.menu.removeFromPlaylist'),
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

  if (containingReleases.value.length) {
    groups.push({
      id: 'navigation',
      items: [
        {
          id: 'containing-releases',
          kind: 'submenu',
          label: t('track.menu.includedIn'),
          icon: Disc3,
          content: {
            kind: 'actions',
            groups: [
              {
                id: 'releases',
                items: containingReleases.value.map((release) => ({
                  id: `release:${release.id}`,
                  kind: 'action',
                  label: t(
                    release.id === props.releaseContextId
                      ? 'track.menu.releaseCurrent'
                      : 'track.menu.release',
                    {
                      name: release.name,
                      type: releaseTypeLabel(release.type),
                    },
                  ),
                  value: {
                    action: TRACK_MENU_ACTIONS.goToRelease,
                    collectionId: release.id,
                  },
                })),
              },
            ],
          },
        },
      ],
    });
  } else if (releaseLoading.value || releaseError.value) {
    groups.push({
      id: 'navigation',
      items: [
        {
          id: 'release-status',
          kind: 'action',
          label: releaseLoading.value
            ? t('track.menu.checkingReleases')
            : t('track.menu.releasesFailed'),
          disabled: true,
        },
      ],
    });
  } else if (props.canGoToAlbum) {
    groups.push({
      id: 'navigation',
      items: [
        {
          id: 'go-to-album',
          kind: 'action',
          label: t('track.menu.goToAlbum'),
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
          label: t('track.menu.delete'),
          icon: Trash2,
          intent: 'danger',
          value: { action: TRACK_MENU_ACTIONS.deleteTrack },
        },
      ],
    });
  }

  return { kind: 'actions', groups, emptyText: t('track.menu.noActions') };
});

function forwardSelect(value, item) {
  if (value?.action === 'supplement-release') {
    if (props.track) useReleaseCatalog().open(props.track);
    emit('close');
    return;
  }
  emit('select', value, item);
}
</script>

<template>
  <UiActionMenu
    :open="open"
    :anchor="anchor"
    :content="content"
    :aria-label="t('track.menu.label')"
    @select="forwardSelect"
    @close="emit('close')"
  />
</template>
