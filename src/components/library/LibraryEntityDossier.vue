<script setup>
import { computed } from 'vue';
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import {
  FOLDER_DOSSIER_ARTWORK_SIZE,
  FOLDER_DOSSIER_GLYPH_SIZE,
} from '../../constants/ui.js';
import { FolderOpen, Library, UserRound } from '../../icons/index.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import AppFolderDossier from '../layout/AppFolderDossier.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiTextButton from '../ui/UiTextButton.vue';

const props = defineProps({
  entityKind: {
    type: String,
    required: true,
    validator: (value) =>
      ['library', 'playlist', 'album', 'artist'].includes(value),
  },
  // Library pages only: which library view the icon artwork represents.
  libraryView: { type: String, default: 'all' },
  releaseType: { type: String, default: '' },
  title: { type: String, required: true },
  titleId: { type: String, default: 'collection-title' },
  titleTag: {
    type: String,
    default: 'h1',
    validator: (value) => ['h1', 'h2', 'h3'].includes(value),
  },
  artist: { type: String, default: '' },
  artistLinkLabel: { type: String, default: '' },
  // Summary values, already formatted: ['2019', '14 首曲目，49 分'].
  fields: { type: Array, default: () => [] },
  coverTracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  description: { type: String, default: '' },
});

const emit = defineEmits(['selectArtist']);

const MARKER_BY_KIND = Object.freeze({
  album: '專輯',
  artist: '藝人',
  library: '曲庫',
  playlist: '播放清單',
});

const isLibrary = computed(() => props.entityKind === 'library');
const marker = computed(() =>
  props.entityKind === 'album'
    ? releaseTypeLabel(props.releaseType || 'album')
    : MARKER_BY_KIND[props.entityKind],
);
const libraryIcon = computed(() =>
  props.libraryView === 'local' ? FolderOpen : Library,
);
// Library titles are UI text; everything else is user content.
const titleLang = computed(() =>
  isLibrary.value ? undefined : contentLangAttribute(props.title, props.artist),
);
const summaryFields = computed(() =>
  props.fields.map((text, index) => ({ key: `${index}:${text}`, text })),
);
</script>

<template>
  <AppFolderDossier
    class="library-entity-dossier"
    :marker="marker"
    :title="title"
    :title-id="titleId"
    :title-tag="titleTag"
    :title-lang="titleLang"
    :fields="summaryFields"
    :description="description"
    :artwork-shape="entityKind === 'artist' ? 'round' : 'square'"
  >
    <template #artwork>
      <span v-if="isLibrary" class="library-entity-dossier__icon">
        <component
          :is="libraryIcon"
          :size="FOLDER_DOSSIER_GLYPH_SIZE"
          aria-hidden="true"
        />
      </span>
      <!-- The bordered frame is the single radius clip, so the thumb and its
           overlay plane composite inside it without their own radius.
           Full-cover content (scrims, cover actions) shares the overlay
           plane; corner controls use #artwork-action. -->
      <UiCollageThumb
        v-else
        :cover-url="coverUrl"
        :tracks="coverTracks"
        :can-collage="entityKind === 'playlist'"
        :size="FOLDER_DOSSIER_ARTWORK_SIZE"
        radius="0"
        :empty-icon="entityKind === 'artist' ? UserRound : null"
        :decorative="!$slots['artwork-overlay']"
      >
        <template v-if="$slots['artwork-overlay']" #overlay>
          <slot name="artwork-overlay" />
        </template>
      </UiCollageThumb>
      <slot name="artwork-action" />
    </template>

    <template v-if="artist" #owner>
      <UiTextButton
        v-if="artistLinkLabel"
        class="library-entity-dossier__artist-link"
        :text="artist"
        :aria-label="artistLinkLabel"
        :lang="contentLangAttribute(artist)"
        @click="emit('selectArtist')"
      />
      <span v-else :lang="contentLangAttribute(artist)">{{ artist }}</span>
    </template>
  </AppFolderDossier>
</template>

<style scoped>
.library-entity-dossier__icon {
  display: grid;
  place-items: center;
  inline-size: var(--ui-folder-dossier-artwork-size);
  block-size: var(--ui-folder-dossier-artwork-size);
  /* Same entry plate as the sidebar's library rows. */
  background: var(--ui-color-entry);
  color: var(--ui-color-entry-foreground);
}

/* UiTextButton leaves font-weight to its caller. */
.library-entity-dossier__artist-link {
  font-weight: inherit;
}
</style>
