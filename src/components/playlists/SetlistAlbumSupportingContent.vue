<script setup>
import { computed, useId } from 'vue';
import UiButton from '../ui/UiButton.vue';
import SetlistAlbumCard from './SetlistAlbumCard.vue';

const props = defineProps({
  artist: { type: String, required: true },
  relatedAlbums: { type: Array, default: () => [] },
  // Artist pages reuse the album grid under their own heading, without summary.
  albumsTitle: { type: String, default: '' },
  summary: { type: Object, default: null },
  canOpenArtist: { type: Boolean, default: false },
  playingAlbumId: { type: String, default: '' },
});

const emit = defineEmits(['selectAlbum', 'playAlbum', 'selectArtist']);
const instanceId = useId();
const relatedTitleId = `setlist-related-albums-${instanceId}`;
const summaryTitleId = `setlist-artist-summary-${instanceId}`;
const defaultAlbumsTitle = computed(() => `更多來自 ${props.artist} 的內容`);
const yearLabel = computed(() => {
  if (!props.summary) return '';
  const { yearStart, yearEnd } = props.summary;
  if (!yearStart) return '';
  return yearEnd && yearEnd !== yearStart
    ? `${yearStart}–${yearEnd}`
    : String(yearStart);
});
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

    <section
      v-if="summary"
      class="setlist-album-supporting__section"
      :aria-labelledby="summaryTitleId"
    >
      <div class="setlist-album-supporting__summary-heading">
        <h2 :id="summaryTitleId">藝人曲庫摘要</h2>
        <UiButton
          v-if="canOpenArtist"
          variant="secondary"
          :aria-label="`查看藝人：${artist}`"
          @click="emit('selectArtist')"
        >
          查看藝人
        </UiButton>
      </div>
      <p class="setlist-album-supporting__summary-copy">
        以下僅統計目前本機曲庫中標記為{{ artist }}的內容。
      </p>
      <dl class="setlist-album-supporting__facts">
        <div>
          <dt>曲目</dt>
          <dd>{{ summary.trackCount }} 首曲目</dd>
        </div>
        <div>
          <dt>專輯</dt>
          <dd>{{ summary.albumCount }} 張專輯</dd>
        </div>
        <div v-if="yearLabel">
          <dt>收錄年份</dt>
          <dd>{{ yearLabel }}</dd>
        </div>
      </dl>
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

.setlist-album-supporting__section h2,
.setlist-album-supporting__summary-copy {
  margin: 0;
}

.setlist-album-supporting__section h2 {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

.setlist-album-supporting__summary-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-3);
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

.setlist-album-supporting__summary-copy,
.setlist-album-supporting__facts dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.setlist-album-supporting__summary-copy {
  max-inline-size: 72ch;
}

.setlist-album-supporting__facts {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-5);
}

.setlist-album-supporting__facts div {
  min-inline-size: 6rem;
  display: grid;
  gap: var(--ui-space-1);
}

.setlist-album-supporting__facts dt,
.setlist-album-supporting__facts dd {
  margin: 0;
}

.setlist-album-supporting__facts dd {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}
</style>
