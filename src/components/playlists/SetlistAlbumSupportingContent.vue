<script setup>
import { computed } from 'vue';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import AppFolderSection from '../layout/AppFolderSection.vue';
import SetlistAlbumCard from './SetlistAlbumCard.vue';

const props = defineProps({
  artist: { type: String, required: true },
  relatedAlbums: { type: Array, default: () => [] },
  albumsTitle: { type: String, default: '' },
  playingAlbumId: { type: String, default: '' },
});

const emit = defineEmits(['selectAlbum', 'playAlbum']);
const sectionTitle = computed(
  () => props.albumsTitle || `更多來自 ${props.artist} 的內容`,
);
// Only the default title embeds the artist name, which is user content.
const sectionTitleLang = computed(() =>
  props.albumsTitle ? undefined : contentLangAttribute(props.artist),
);
const albumCountLabel = computed(() => `${props.relatedAlbums.length} 張`);
</script>

<template>
  <div class="setlist-album-supporting" aria-label="專輯延伸內容">
    <AppFolderSection
      v-if="relatedAlbums.length > 0"
      :title="sectionTitle"
      :title-lang="sectionTitleLang"
      :meta="albumCountLabel"
    >
      <ul class="setlist-album-supporting__albums">
        <li
          v-for="album in relatedAlbums"
          :key="album.id"
          class="setlist-album-supporting__album-item"
        >
          <SetlistAlbumCard
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
.setlist-album-supporting {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-6);
  padding-block-start: var(--ui-space-6);
}

.setlist-album-supporting__albums {
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, 10rem);
  gap: var(--ui-space-4);
  list-style: none;
}

.setlist-album-supporting__album-item {
  min-inline-size: 0;
}
</style>
