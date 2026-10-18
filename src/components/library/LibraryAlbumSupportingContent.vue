<script setup>
import { computed } from 'vue';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import AppFolderSection from '../layout/AppFolderSection.vue';
import LibraryAlbumCard from './LibraryAlbumCard.vue';
import { useDeferredLoading } from '../../composables/useDeferredLoading.js';
import '../../styles/loading.css';

const props = defineProps({
  artist: { type: String, required: true },
  loading: { type: Boolean, default: false },
  contentKey: { type: String, default: '' },
  relatedAlbums: { type: Array, default: () => [] },
  albumsTitle: { type: String, default: '' },
  playingAlbumId: { type: String, default: '' },
});

const emit = defineEmits(['selectAlbum', 'playAlbum']);
const initialLoading = computed(
  () => props.loading && props.relatedAlbums.length === 0,
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
  initialLoading.value ? '' : `${props.relatedAlbums.length} 張`,
);
</script>

<template>
  <div
    class="library-album-supporting"
    aria-label="專輯延伸內容"
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
          v-for="album in relatedAlbums"
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

.library-album-supporting__album-item {
  min-inline-size: 0;
}

.library-album-supporting__albums--waiting {
  visibility: hidden;
}
</style>
