<script setup>
import { computed } from 'vue';
import { ListPlus, Pencil } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import CollectionActionRail from './CollectionActionRail.vue';
import LibraryEntityDossier from './LibraryEntityDossier.vue';

const props = defineProps({
  entityKind: {
    type: String,
    required: true,
    validator: (value) => ['playlist', 'album'].includes(value),
  },
  title: { type: String, required: true },
  titleId: { type: String, default: 'collection-title' },
  artist: { type: String, default: '' },
  meta: { type: String, default: '' },
  // Full list: UiCollageThumb alone decides how many tracks a collage shows.
  coverTracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  description: { type: String, default: '' },
  playing: { type: Boolean, default: false },
  shuffleActive: { type: Boolean, default: false },
  canPlay: { type: Boolean, default: false },
  canShuffle: { type: Boolean, default: false },
  canAddToQueue: { type: Boolean, default: false },
  canAddToPlaylist: { type: Boolean, default: false },
  addToPlaylistItems: { type: Array, default: () => [] },
  moreItems: { type: Array, default: () => [] },
  searchQuery: { type: String, default: '' },
});

const emit = defineEmits([
  'togglePlayback',
  'toggleShuffle',
  'addToQueue',
  'openEditDetails',
  'menuAction',
  'update:searchQuery',
]);

const isAlbum = computed(() => props.entityKind === 'album');
const entityLabel = computed(() => (isAlbum.value ? '此專輯' : '此播放清單'));
const entityAction = computed(() =>
  isAlbum.value
    ? {
        icon: ListPlus,
        label: '將專輯新增至播放清單',
        disabled:
          !props.canAddToPlaylist || props.addToPlaylistItems.length === 0,
        menuItems: props.addToPlaylistItems,
      }
    : {
        icon: Pencil,
        label: '編輯播放清單詳細資料',
        disabled: false,
      },
);

function activateEntityAction() {
  if (!isAlbum.value) emit('openEditDetails');
}

function handleMenuAction(value) {
  emit('menuAction', value);
}
</script>

<template>
  <section class="setlist-collection-header">
    <LibraryEntityDossier
      :entity-kind="entityKind"
      :title="title"
      :title-id="titleId"
      :artist="artist"
      :meta="meta"
      :cover-tracks="coverTracks"
      :cover-url="coverUrl"
      :description="description"
    >
      <template v-if="entityKind === 'playlist'" #artwork-action>
        <UiIconButton
          :icon="Pencil"
          class="setlist-collection-header__cover-edit"
          label="編輯播放清單詳細資料"
          variant="overlay"
          @click="emit('openEditDetails')"
        />
      </template>
    </LibraryEntityDossier>

    <CollectionActionRail
      :entity-label="entityLabel"
      :playing="playing"
      :shuffle-active="shuffleActive"
      :can-play="canPlay"
      :can-shuffle="canShuffle"
      :can-add-to-queue="canAddToQueue"
      :entity-action="entityAction"
      :more-items="moreItems"
      :search-query="searchQuery"
      @toggle-playback="emit('togglePlayback')"
      @toggle-shuffle="emit('toggleShuffle')"
      @add-to-queue="emit('addToQueue')"
      @entity-action="activateEntityAction"
      @menu-action="handleMenuAction"
      @update:search-query="emit('update:searchQuery', $event)"
    />
  </section>
</template>

<style scoped>
.setlist-collection-header {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
}

.setlist-collection-header__cover-edit {
  position: absolute;
  right: var(--ui-space-2);
  bottom: var(--ui-space-2);
  opacity: 0;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

:deep(.library-entity-dossier__artwork:hover)
  .setlist-collection-header__cover-edit,
:deep(.library-entity-dossier__artwork:focus-within)
  .setlist-collection-header__cover-edit,
.setlist-collection-header__cover-edit:focus-visible {
  opacity: 1;
}
</style>
