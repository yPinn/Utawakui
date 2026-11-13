<script setup>
import { computed } from 'vue';
import { useAlbumNavigation } from '../../../composables/useAlbumNavigation.js';
import { useArtistIndex } from '../../../composables/useArtistIndex.js';
import { trackArtistText } from '../../../utils/artistPage.js';
import { trackTitlePresentation } from '../../../utils/trackTitlePresentation.js';
import UiTrackThumb from '../../ui/UiTrackThumb.vue';
import TrackContextHeroIdentity from './TrackContextHeroIdentity.vue';
import { t } from '../../../utils/i18n.js';

const props = defineProps({
  track: { type: Object, required: true },
});

const { state: artistIndexState } = useArtistIndex();
const presentation = computed(() => trackTitlePresentation(props.track));
const title = computed(
  () => presentation.value.title || t('player.context.untitledTrack'),
);
const artistName = computed(
  () =>
    trackArtistText(props.track, artistIndexState.index) ||
    t('player.context.unknownArtist'),
);
const accessibleLabel = computed(() =>
  t('player.context.currentSongNamed', {
    title: title.value,
    artist: artistName.value,
  }),
);
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();
const trackAlbum = computed(() => albumForTrack(props.track));
const albumCtaLabel = computed(() =>
  trackAlbum.value
    ? t('player.context.goToAlbumNamed', {
        title: title.value,
        album: trackAlbum.value.name || t('player.context.untitledAlbum'),
      })
    : '',
);

function openAlbum() {
  if (!trackAlbum.value) return;
  jumpToAlbum(props.track);
}
</script>

<template>
  <article
    class="track-context-hero"
    :class="{ 'track-context-hero--video': $slots.video }"
    :aria-label="accessibleLabel"
  >
    <UiTrackThumb
      v-if="!$slots.video"
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
          <TrackContextHeroIdentity
            :track="track"
            :title="title"
            :artist-name="artistName"
            :album-cta-label="albumCtaLabel"
            @open-album="openAlbum"
          >
            <template v-if="$slots.actions" #actions>
              <slot name="actions" />
            </template>
          </TrackContextHeroIdentity>
        </div>
      </template>
    </UiTrackThumb>
    <template v-else>
      <div class="track-context-hero__video">
        <slot name="video" />
      </div>
      <TrackContextHeroIdentity
        class="track-context-hero__caption"
        :track="track"
        :title="title"
        :artist-name="artistName"
        :album-cta-label="albumCtaLabel"
        @open-album="openAlbum"
      >
        <template v-if="$slots.actions" #actions>
          <slot name="actions" />
        </template>
      </TrackContextHeroIdentity>
    </template>
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

.track-context-hero--video {
  display: grid;
  gap: var(--ui-space-2);
  aspect-ratio: auto;
  box-shadow: none;
}

.track-context-hero__video {
  display: grid;
  aspect-ratio: 16 / 9;
  min-inline-size: 0;
  border-radius: inherit;
  overflow: hidden;
  background: var(--ui-color-surface);
}

.track-context-hero__caption {
  padding: 0 var(--ui-space-2);
  color: var(--ui-color-text);
}
</style>
