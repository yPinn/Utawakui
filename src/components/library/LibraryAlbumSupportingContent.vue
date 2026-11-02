<script setup>
import { computed, shallowRef, useId, watch } from 'vue';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import AppFolderSection from '../layout/AppFolderSection.vue';
import LibraryAlbumCard from './LibraryAlbumCard.vue';
import { useDeferredLoading } from '../../composables/useDeferredLoading.js';
import { filterReleases } from '../../utils/releasePresentation.js';
import UiTabs from '../ui/UiTabs.vue';
import UiHint from '../ui/UiHint.vue';
import '../../styles/loading.css';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  artist: { type: String, required: true },
  loading: { type: Boolean, default: false },
  contentKey: { type: String, default: '' },
  relatedAlbums: { type: Array, default: () => [] },
  albumsTitle: { type: String, default: '' },
  playingAlbumId: { type: String, default: '' },
  releaseFilters: { type: Boolean, default: false },
});

const emit = defineEmits(['selectAlbum', 'playAlbum']);
const filter = shallowRef('all');
const filterTabsId = `music-releases-${useId()}`;
const filterItems = [
  { id: 'all', label: t('library.supporting.all') },
  { id: 'albums', label: t('library.supporting.albums') },
  { id: 'singles-ep', label: t('library.supporting.singlesEp') },
];
const visibleAlbums = computed(() =>
  props.releaseFilters
    ? filterReleases(props.relatedAlbums, filter.value)
    : props.relatedAlbums,
);
watch(
  () => props.contentKey || props.artist,
  () => {
    filter.value = 'all';
  },
);
const initialLoading = computed(
  () => props.loading && props.relatedAlbums.length === 0,
);
const filterTabs = computed(() =>
  filterItems.map((item) => ({ ...item, disabled: initialLoading.value })),
);
const { skeletonVisible, revealContent, finishReveal } = useDeferredLoading(
  initialLoading,
  {
    identity: () => props.contentKey || props.artist,
    hasContent: () => props.relatedAlbums.length > 0,
  },
);
const sectionTitle = computed(
  () =>
    props.albumsTitle ||
    t('library.supporting.moreFrom', { artist: props.artist }),
);
// Only the default title embeds the artist name, which is user content.
const sectionTitleLang = computed(() =>
  props.albumsTitle ? undefined : contentLangAttribute(props.artist),
);
const albumCountLabel = computed(() =>
  initialLoading.value
    ? ''
    : t('library.supporting.count', { count: visibleAlbums.value.length }),
);
</script>

<template>
  <div
    class="library-album-supporting"
    :aria-label="
      t(
        releaseFilters
          ? 'library.supporting.discography'
          : 'library.supporting.extended',
      )
    "
    :aria-busy="initialLoading || undefined"
  >
    <span v-if="initialLoading" role="status" class="ui-visually-hidden">{{
      t('library.supporting.loading')
    }}</span>
    <AppFolderSection
      v-if="initialLoading || relatedAlbums.length > 0"
      :title="sectionTitle"
      :title-lang="sectionTitleLang"
      :meta="albumCountLabel"
    >
      <div v-if="releaseFilters" class="library-album-supporting__filters">
        <UiTabs
          v-model:active-id="filter"
          :items="filterTabs"
          variant="bar"
          distribution="content"
          :aria-label="t('library.supporting.filterLabel')"
          :tab-id-prefix="filterTabsId"
          :panel-id-prefix="filterTabsId"
        />
      </div>
      <div
        :id="releaseFilters ? `${filterTabsId}-${filter}-panel` : undefined"
        :role="releaseFilters ? 'tabpanel' : undefined"
        :aria-labelledby="
          releaseFilters ? `${filterTabsId}-${filter}-tab` : undefined
        "
      >
        <ul
          v-if="initialLoading"
          class="library-album-supporting__albums"
          :class="{
            'library-album-supporting__albums--waiting': !skeletonVisible,
          }"
          aria-hidden="true"
        >
          <li
            v-for="index in 4"
            :key="index"
            class="library-album-supporting__album-item"
          >
            <LibraryAlbumCard loading />
          </li>
        </ul>
        <ul
          v-else
          class="library-album-supporting__albums"
          :class="{ 'ui-loading-content-enter': revealContent }"
          @animationend.self="finishReveal"
        >
          <li
            v-for="album in visibleAlbums"
            :key="album.id"
            class="library-album-supporting__album-item"
          >
            <LibraryAlbumCard
              :album="album"
              :playing="album.id === playingAlbumId"
              @select="emit('selectAlbum', $event)"
              @play="emit('playAlbum', $event)"
            />
          </li>
        </ul>
        <UiHint v-if="!initialLoading && !visibleAlbums.length" role="status">{{
          t('library.supporting.noMatch')
        }}</UiHint>
      </div>
    </AppFolderSection>
  </div>
</template>

<style scoped>
.library-album-supporting {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-6);
  padding-block-start: var(--ui-space-6);
}

.library-album-supporting__albums {
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, 10rem);
  gap: var(--ui-space-4);
  list-style: none;
}

.library-album-supporting__filters {
  justify-self: start;
  inline-size: fit-content;
  max-inline-size: 100%;
}

.library-album-supporting__album-item {
  min-inline-size: 0;
}

.library-album-supporting__albums--waiting {
  visibility: hidden;
}
</style>
