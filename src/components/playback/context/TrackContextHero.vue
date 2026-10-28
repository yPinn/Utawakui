<script setup>
import { computed } from 'vue';
import { useAlbumNavigation } from '../../../composables/useAlbumNavigation.js';
import { useArtistIndex } from '../../../composables/useArtistIndex.js';
import { artistCreditLinks } from '../../../utils/artistPage.js';
import TrackArtistCredits from '../../track/TrackArtistCredits.vue';
import UiTextButton from '../../ui/UiTextButton.vue';
import UiTrackThumb from '../../ui/UiTrackThumb.vue';
import UiOverflowTooltip from '../../ui/UiOverflowTooltip.vue';

const props = defineProps({
  track: { type: Object, required: true },
});

const { state: artistIndexState } = useArtistIndex();
const artistName = computed(() => {
  const links = artistCreditLinks(props.track, artistIndexState.index);
  return (
    links?.map((link) => link.text).join(', ') ||
    props.track?.artist ||
    '未知演唱者'
  );
});
const accessibleLabel = computed(
  () => `目前歌曲：${props.track?.title || '未命名曲目'}，${artistName.value}`,
);
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();
const trackAlbum = computed(() => albumForTrack(props.track));
const albumCtaLabel = computed(() =>
  trackAlbum.value
    ? `${props.track?.title || '未命名曲目'}，前往專輯：${trackAlbum.value.name || '未命名專輯'}`
    : '',
);

function openAlbum() {
  if (!trackAlbum.value) return;
  jumpToAlbum(props.track);
}
</script>

<template>
  <article class="track-context-hero" :aria-label="accessibleLabel">
    <UiTrackThumb
      class="track-context-hero__artwork"
      :track="track"
      size="100%"
      radius="var(--ui-radius-lg)"
      font-size="var(--ui-font-size-2xl)"
      :decorative="false"
      decoding="async"
    >
      <template #overlay>
        <div class="track-context-hero__overlay">
          <div class="track-context-hero__identity">
            <div class="track-context-hero__copy">
              <UiTextButton
                v-if="trackAlbum"
                class="track-context-hero__title"
                :text="track.title || '未命名曲目'"
                :aria-label="albumCtaLabel"
                overflow="clamp"
                @click="openAlbum"
              />
              <UiOverflowTooltip
                v-else
                as="p"
                class="track-context-hero__title track-context-hero__title-text"
                :text="track.title || '未命名曲目'"
              >
                {{ track.title || '未命名曲目' }}
              </UiOverflowTooltip>
              <TrackArtistCredits
                v-if="track.artist"
                class="track-context-hero__artist"
                :track="track"
                :title="artistName"
              />
              <UiOverflowTooltip
                v-else
                as="p"
                class="track-context-hero__artist"
                :text="artistName"
              >
                {{ artistName }}
              </UiOverflowTooltip>
            </div>
            <div v-if="$slots.actions" class="track-context-hero__actions">
              <slot name="actions" />
            </div>
          </div>
        </div>
      </template>
    </UiTrackThumb>
  </article>
</template>

<style scoped>
.track-context-hero {
  min-inline-size: 0;
  max-inline-size: var(--ui-right-dock-hero-max-inline-size, 100%);
  aspect-ratio: 1;
  /* Shapes the shadow only; the artwork thumb is the single radius clip. */
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-contact);
}

.track-context-hero__artwork {
  display: flex;
}

.track-context-hero__overlay {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--ui-space-4);
  background: linear-gradient(
    to bottom,
    var(--ui-color-overlay-scrim),
    transparent 38%,
    transparent 46%,
    var(--ui-color-overlay-scrim-active)
  );
  color: var(--ui-color-overlay-contrast);
}

.track-context-hero__identity {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ui-space-2);
}

.track-context-hero__copy {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.track-context-hero__title,
.track-context-hero__artist {
  margin: 0;
  max-inline-size: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.track-context-hero__title {
  color: inherit;
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.track-context-hero__title-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.track-context-hero__artist {
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-context-hero__actions {
  align-self: end;
}

.track-context-hero__identity {
  -webkit-user-select: none;
  user-select: none;
}
</style>
