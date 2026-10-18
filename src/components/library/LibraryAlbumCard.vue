<script setup>
import { ARTWORK_SIZE } from '../../constants/ui.js';
import { contentLangAttribute } from '../../utils/contentLanguage.js';
import PlaybackPrimaryButton from '../playback/PlaybackPrimaryButton.vue';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';

const ALBUM_ARTWORK_SIZE = ARTWORK_SIZE.xl;

const props = defineProps({
  album: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  playing: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'play']);

function selectAlbum() {
  emit('select', props.album.id);
}

function playAlbum(event) {
  event.stopPropagation();
  emit('play', props.album.id);
}
</script>

<template>
  <div
    class="library-album-card"
    :class="{ 'library-album-card--skeleton': loading }"
    :aria-hidden="loading ? 'true' : undefined"
    data-artwork-reveal-scope="focus-within"
  >
    <template v-if="loading">
      <UiSkeleton shape="block" class="library-album-card__skeleton-artwork" />
      <div class="library-album-card__copy">
        <UiSkeleton class="library-album-card__skeleton-title" />
        <UiSkeleton class="library-album-card__skeleton-year" />
      </div>
    </template>
    <template v-else-if="album">
      <button
        type="button"
        class="library-album-card__open"
        :aria-label="`開啟專輯：${album.name}`"
        @click="selectAlbum"
      />
      <UiCollageThumb
        class="library-album-card__artwork"
        :cover-url="album.coverUrl"
        :tracks="album.tracks"
        :can-collage="false"
        :size="ALBUM_ARTWORK_SIZE"
      />
      <UiArtworkReveal class="library-album-card__play">
        <PlaybackPrimaryButton
          :playing="playing"
          :play-label="`播放專輯：${album.name}`"
          :pause-label="`暫停專輯：${album.name}`"
          @click="playAlbum"
        />
      </UiArtworkReveal>
      <span class="library-album-card__copy">
        <strong :lang="contentLangAttribute(album.name, album.artist)">{{
          album.name
        }}</strong>
        <span v-if="album.releaseYear">{{ album.releaseYear }}</span>
      </span>
    </template>
  </div>
</template>

<style scoped>
.library-album-card {
  position: relative;
  isolation: isolate;
  min-inline-size: 0;
  inline-size: 100%;
  padding: var(--ui-space-3);
  display: grid;
  grid-template-rows: max-content max-content;
  justify-items: stretch;
  gap: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  text-align: start;
  transition: background-color var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.library-album-card:hover,
.library-album-card:focus-within {
  background: var(--ui-color-surface-hover);
}

.library-album-card--skeleton {
  pointer-events: none;
}

.library-album-card__skeleton-artwork {
  --ui-skeleton-block-min-block-size: var(--ui-artwork-size-xl);
  inline-size: var(--ui-artwork-size-xl);
  aspect-ratio: 1;
}

.library-album-card__skeleton-title {
  min-block-size: calc(
    var(--ui-type-label-size) * var(--ui-type-label-line-height)
  );
  align-content: center;
}

.library-album-card__skeleton-year {
  min-block-size: calc(
    var(--ui-type-caption-size) * var(--ui-type-caption-line-height)
  );
  inline-size: 48%;
  align-content: center;
}

.library-album-card:has(.library-album-card__open:active) {
  background: var(--ui-color-surface-active);
}

.library-album-card:has(.library-album-card__open:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.library-album-card__artwork,
.library-album-card__open {
  grid-area: 1 / 1;
}

.library-album-card__open {
  z-index: var(--ui-layer-raised);
  grid-area: 1 / 1 / 3 / 2;
  align-self: stretch;
  justify-self: stretch;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}

.library-album-card__play {
  z-index: var(--ui-layer-overlay);
  grid-area: 1 / 1;
  align-self: end;
  justify-self: end;
  margin: var(--ui-space-2);
}

.library-album-card__play :deep(.ui-icon-btn) {
  box-shadow: var(--ui-shadow-overlay);
}

.library-album-card__copy {
  grid-area: 2 / 1;
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.library-album-card__copy strong,
.library-album-card__copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-album-card__copy strong {
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.library-album-card__copy span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
</style>
