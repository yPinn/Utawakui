<script setup>
import { computed } from 'vue';
import { PLAYER_BAR_ARTWORK_SIZE } from '../../constants/ui.js';
import { Music2 } from '../../icons/index.js';
import { trackContentLang } from '../../utils/contentLanguage.js';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import TrackArtistCredits from './TrackArtistCredits.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import UiMarqueeText from '../ui/UiMarqueeText.vue';
import UiTooltip from '../ui/UiTooltip.vue';
const props = defineProps({
  track: { type: Object, default: null },
  artworkSize: { type: [Number, String], default: PLAYER_BAR_ARTWORK_SIZE },
  emptyLabel: { type: String, default: '' },
});
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();
const currentTrackAlbum = computed(() => albumForTrack(props.track));
const currentTrackAlbumCtaLabel = computed(() => {
  if (!currentTrackAlbum.value) return '';
  return `${props.track?.title || '目前歌曲'}，前往專輯：${currentTrackAlbum.value.name || '未命名專輯'}`;
});
function jumpToCurrentTrackAlbum() {
  if (currentTrackAlbum.value) jumpToAlbum(props.track);
}
</script>
<template>
  <div class="playback-track">
    <slot name="artwork">
      <UiTrackThumb
        v-if="track || emptyLabel"
        :track="track"
        :size="artworkSize"
        radius="var(--ui-radius-sm)"
      >
        <Music2 v-if="!track" aria-hidden="true" />
      </UiTrackThumb>
    </slot>
    <div class="playback-track-copy" :lang="trackContentLang(track)">
      <template v-if="track">
        <UiTooltip v-if="currentTrackAlbum" :text="currentTrackAlbumCtaLabel">
          <template #trigger="{ triggerProps }">
            <button
              v-bind="triggerProps"
              type="button"
              class="playback-track-title playback-track-title-button"
              :aria-label="currentTrackAlbumCtaLabel"
              @click="jumpToCurrentTrackAlbum"
            >
              <UiMarqueeText
                class="playback-track-title-marquee"
                :text="track.title"
                :tooltip-enabled="false"
              />
            </button>
          </template>
        </UiTooltip>
        <UiMarqueeText
          v-else
          class="playback-track-title"
          :text="track.title"
        />
        <span v-if="track.artist" class="playback-track-artist">
          <TrackArtistCredits :track="track" />
        </span>
      </template>
      <span v-else-if="emptyLabel" class="playback-track-empty">{{
        emptyLabel
      }}</span>
    </div>
    <slot name="trail" />
  </div>
</template>
<style scoped>
.playback-track {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}
.playback-track-copy {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.playback-track-empty {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.playback-track-title {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
  text-decoration: none;
}

.playback-track-title-button {
  display: block;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-color-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
}

.playback-track-title-button:hover {
  color: var(--ui-color-text);
}

.playback-track-title-button :deep(.ui-marquee__text) {
  text-decoration-line: none;
  text-decoration-color: currentColor;
}

.playback-track-title-button:hover :deep(.ui-marquee__text),
.playback-track-title-button:focus-visible :deep(.ui-marquee__text) {
  text-decoration-line: underline;
  text-decoration-thickness: var(--ui-border-width);
  text-underline-offset: 0.12em;
}

.playback-track-title-button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
  border-radius: var(--ui-radius-md);
}

.playback-track-title-marquee {
  color: inherit;
  font-size: var(--ui-font-size-sm);
  font-weight: inherit;
  line-height: inherit;
}

.playback-track-artist {
  display: block;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
