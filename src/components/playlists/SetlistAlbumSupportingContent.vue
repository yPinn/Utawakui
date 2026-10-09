<script setup>
import { computed, useId } from 'vue';
import SetlistAlbumCard from './SetlistAlbumCard.vue';

const props = defineProps({
  artist: { type: String, required: true },
  relatedAlbums: { type: Array, default: () => [] },
  albumsTitle: { type: String, default: '' },
  playingAlbumId: { type: String, default: '' },
});

const emit = defineEmits(['selectAlbum', 'playAlbum']);
const instanceId = useId();
const relatedTitleId = `setlist-related-albums-${instanceId}`;
const defaultAlbumsTitle = computed(() => `更多來自 ${props.artist} 的內容`);
</script>

<template>
  <div class="setlist-album-supporting" aria-label="專輯延伸內容">
    <section
      v-if="relatedAlbums.length > 0"
      class="setlist-album-supporting__section"
      :aria-labelledby="relatedTitleId"
    >
      <h2 :id="relatedTitleId">
        {{ albumsTitle || defaultAlbumsTitle }}
      </h2>
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
    </section>
  </div>
</template>

<style scoped>
.setlist-album-supporting {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-6);
  padding-block-start: var(--ui-space-6);
}

.setlist-album-supporting__section {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.setlist-album-supporting__section h2 {
  margin: 0;
}

.setlist-album-supporting__section h2 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
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
