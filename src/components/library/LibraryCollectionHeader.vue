<script setup>
import { computed } from 'vue';
import { FOLDER_DOSSIER_GLYPH_SIZE } from '../../constants/ui.js';
import { releaseEntityKey } from '../../utils/releasePresentation.js';
import {
  ImagePlus,
  ListPlus,
  Pencil,
  UserRoundPlus,
} from '../../icons/index.js';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';
import UiButton from '../ui/UiButton.vue';
import UiTooltipSurface from '../ui/tooltip/UiTooltipSurface.vue';
import { useTooltip } from '../ui/useTooltip.js';
import UiIconButton from '../ui/UiIconButton.vue';
import CollectionActionRail from './CollectionActionRail.vue';
import LibraryEntityDossier from './LibraryEntityDossier.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  entityKind: {
    type: String,
    required: true,
    validator: (value) =>
      ['library', 'playlist', 'album', 'artist'].includes(value),
  },
  libraryView: { type: String, default: 'all' },
  releaseType: { type: String, default: '' },
  showShuffle: { type: Boolean, default: true },
  showDensity: { type: Boolean, default: true },
  title: { type: String, required: true },
  titleId: { type: String, default: 'collection-title' },
  artist: { type: String, default: '' },
  artistLinkLabel: { type: String, default: '' },
  fields: { type: Array, default: () => [] },
  // Full list: UiCollageThumb alone decides how many tracks a collage shows.
  coverTracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  description: { type: String, default: '' },
  playing: { type: Boolean, default: false },
  shuffleActive: { type: Boolean, default: false },
  canPlay: { type: Boolean, default: false },
  canShuffle: { type: Boolean, default: false },
  canAddToQueue: { type: Boolean, default: false },
  canPreview: { type: Boolean, default: false },
  previewBlockedReason: { type: String, default: '' },
  canAddToPlaylist: { type: Boolean, default: false },
  addToPlaylistContent: { type: Object, default: null },
  entityActionVisible: { type: Boolean, default: true },
  moreContent: {
    type: Object,
    default: () => ({ kind: 'actions', groups: [] }),
  },
  showSearch: { type: Boolean, default: true },
  searchQuery: { type: String, default: '' },
  density: {
    type: String,
    default: 'list',
    validator: (value) => ['list', 'compact'].includes(value),
  },
});

const emit = defineEmits([
  'togglePlayback',
  'toggleShuffle',
  'addToQueue',
  'preview',
  'openEditDetails',
  'menuAction',
  'selectArtist',
  'choosePhoto',
  'update:searchQuery',
  'updateDensity',
]);

// The empty avatar has no visible text, so it names itself on hover／focus.
const {
  open: photoTooltipOpen,
  position: photoTooltipPosition,
  setTooltip: setPhotoTooltip,
  tooltipId: photoTooltipId,
  triggerProps: photoTooltipTriggerProps,
} = useTooltip({
  text: t('library.choosePhoto'),
  placement: 'top',
  disabled: computed(() => Boolean(props.coverUrl)),
  describedBy: false,
});

const entityLabel = computed(() =>
  t(
    `library.entity.${
      props.entityKind === 'album'
        ? releaseEntityKey(props.releaseType)
        : props.entityKind
    }`,
  ),
);
// Artist pages are read-only references with no entity-specific action.
const entityAction = computed(() => {
  if (!props.entityActionVisible) return null;
  if (props.entityKind === 'artist' || props.entityKind === 'library') {
    return null;
  }
  if (props.entityKind === 'album') {
    return {
      icon: ListPlus,
      label: t(
        `library.addEntityToPlaylist.${releaseEntityKey(props.releaseType)}`,
      ),
      disabled: !props.canAddToPlaylist || !props.addToPlaylistContent,
      menuContent: props.addToPlaylistContent,
    };
  }
  return {
    icon: Pencil,
    label: t('library.editPlaylistDetails'),
    disabled: false,
  };
});

function activateEntityAction() {
  if (props.entityKind === 'playlist') emit('openEditDetails');
}

function handleMenuAction(value) {
  emit('menuAction', value);
}
</script>

<template>
  <section class="library-collection-header">
    <LibraryEntityDossier
      :entity-kind="entityKind"
      :release-type="releaseType"
      :library-view="libraryView"
      :title="title"
      :title-id="titleId"
      :artist="artist"
      :artist-link-label="artistLinkLabel"
      :fields="fields"
      :cover-tracks="coverTracks"
      :cover-url="coverUrl"
      :description="description"
      @select-artist="emit('selectArtist')"
    >
      <template v-if="entityKind === 'playlist'" #artwork-action>
        <UiArtworkReveal class="library-collection-header__cover-edit">
          <UiIconButton
            :icon="Pencil"
            :label="t('library.editPlaylistDetails')"
            variant="overlay"
            @click="emit('openEditDetails')"
          />
        </UiArtworkReveal>
      </template>
      <!-- The whole round avatar is the photo action: a corner button would be
           clipped by the circle. With a photo it reveals on hover; empty, one
           centered add glyph plus tooltip stays visible. -->
      <template v-else-if="entityKind === 'artist'" #artwork-overlay>
        <component
          :is="coverUrl ? UiArtworkReveal : 'span'"
          :class="{ 'library-collection-header__photo-static': !coverUrl }"
        >
          <UiButton
            v-if="coverUrl"
            :icon="ImagePlus"
            variant="overlay"
            stretch
            @click="emit('choosePhoto')"
          >
            {{ t('library.changePhoto') }}
          </UiButton>
          <!-- The add glyph stands in for the avatar placeholder, so it keeps
               the dossier glyph size rather than a control icon size. -->
          <button
            v-else
            v-bind="photoTooltipTriggerProps"
            type="button"
            class="library-collection-header__photo-action library-collection-header__photo-action--empty"
            :aria-label="t('library.choosePhoto')"
            @click="emit('choosePhoto')"
          >
            <UserRoundPlus
              :size="FOLDER_DOSSIER_GLYPH_SIZE"
              aria-hidden="true"
            />
          </button>
        </component>
        <UiTooltipSurface
          :open="photoTooltipOpen"
          :text="t('library.choosePhoto')"
          :tooltip-id="photoTooltipId"
          :position="photoTooltipPosition"
          placement="top"
          :set-element="setPhotoTooltip"
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
      :can-preview="canPreview"
      :preview-blocked-reason="previewBlockedReason"
      :entity-action="entityAction"
      :more-content="moreContent"
      :show-search="showSearch"
      :show-density="showDensity"
      :show-shuffle="showShuffle"
      :search-query="searchQuery"
      :density="density"
      @toggle-playback="emit('togglePlayback')"
      @toggle-shuffle="emit('toggleShuffle')"
      @add-to-queue="emit('addToQueue')"
      @preview="emit('preview')"
      @entity-action="activateEntityAction"
      @menu-action="handleMenuAction"
      @update:search-query="emit('update:searchQuery', $event)"
      @update-density="emit('updateDensity', $event)"
    >
      <template #additional-actions
        ><slot name="additional-actions"
      /></template>
    </CollectionActionRail>
  </section>
</template>

<style scoped>
.library-collection-header {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-4);
}

/* Corner control: positioned here, revealed by UiArtworkReveal with the
   dossier artwork as its focus-within scope. */
.library-collection-header__cover-edit {
  position: absolute;
  right: var(--ui-space-2);
  bottom: var(--ui-space-2);
}

/* The empty avatar's always-visible wrapper stretches like UiArtworkReveal. */
.library-collection-header__photo-static {
  display: grid;
}

/* Sized and clipped by the dossier's UiArtworkOverlay plane. */
.library-collection-header__photo-action {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  font: inherit;
  cursor: pointer;
  transition: background var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.library-collection-header__photo-action:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

/* An empty avatar keeps the invitation visible as one centered add glyph, so
   the thumbnail's own placeholder glyph is hidden beneath it. */
.library-collection-header__photo-action--empty {
  background: transparent;
  color: var(--ui-color-text-muted);
}

:deep(
  .app-folder-dossier__artwork:has(
      .library-collection-header__photo-action--empty
    )
    .ui-collage-thumb__single-empty
) {
  visibility: hidden;
}

.library-collection-header__photo-action--empty:hover {
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
}

.library-collection-header__photo-action--empty:active {
  background: var(--ui-color-surface-active);
}
</style>
