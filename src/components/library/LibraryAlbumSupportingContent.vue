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
  { id: 'all', label: '全部' },
  { id: 'albums', label: '專輯' },
  { id: 'singles-ep', label: '單曲與迷你專輯' },
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
  () => props.albumsTitle || `更多來自 ${props.artist} 的內容`,
);
// Only the default title embeds the artist name, which is user content.
const sectionTitleLang = computed(() =>
  props.albumsTitle ? undefined : contentLangAttribute(props.artist),
);
const albumCountLabel = computed(() =>
  initialLoading.value ? '' : `${visibleAlbums.value.length} 張`,
);
</script>

<template>
  <div
    class="library-album-supporting"
    :aria-label="releaseFilters ? '音樂作品' : '發行延伸內容'"
    :aria-busy="initialLoading || undefined"
  >
    <span v-if="initialLoading" role="status" class="ui-visually-hidden"
      >正在讀取專輯</span
    >
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
          aria-label="發行分類"
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
        <UiHint v-if="!initialLoading && !visibleAlbums.length" role="status"
          >目前沒有符合分類的發行。</UiHint
        >
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
