<script setup>
import { computed } from 'vue';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import UiTrackRow from '../ui/UiTrackRow.vue';
import TrackArtistCredits from './TrackArtistCredits.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  track: { type: Object, required: true },
  title: { type: String, default: undefined },
  artist: { type: String, default: undefined },
  navigation: {
    type: String,
    default: 'none',
    validator: (value) =>
      ['none', 'album', 'artist', 'identity'].includes(value),
  },
});

const emit = defineEmits(['navigate']);
const { albumForTrack, jumpToAlbum } = useAlbumNavigation();

const albumNavigationEnabled = computed(() =>
  ['album', 'identity'].includes(props.navigation),
);
const artistNavigationEnabled = computed(() =>
  ['artist', 'identity'].includes(props.navigation),
);
const albumDestination = computed(() =>
  albumNavigationEnabled.value ? albumForTrack(props.track) : null,
);
const displayTitle = computed(() => props.title ?? props.track?.title ?? '');

function navigateToAlbum() {
  const album = albumDestination.value;
  if (!album) return;
  emit('navigate', { kind: 'album', id: album.id });
  jumpToAlbum(props.track);
}

function announceArtistNavigation(artistId) {
  emit('navigate', { kind: 'artist', id: artistId });
}
</script>

<template>
  <UiTrackRow
    v-bind="$attrs"
    :track="track"
    :title="title"
    :artist="artist"
    :title-clickable="Boolean(albumDestination)"
    :title-aria-label="
      albumDestination ? `前往專輯：${displayTitle}` : undefined
    "
    @title-click="navigateToAlbum"
  >
    <template v-if="$slots.lead" #lead>
      <slot name="lead" />
    </template>
    <template v-if="artistNavigationEnabled || $slots.artist" #artist>
      <TrackArtistCredits
        v-if="artistNavigationEnabled"
        :track="track"
        @navigate="announceArtistNavigation"
      />
      <slot v-else name="artist" />
    </template>
    <template v-if="$slots.artworkOverlay" #artworkOverlay>
      <slot name="artworkOverlay" />
    </template>
    <template v-if="$slots.trail" #trail>
      <slot name="trail" />
    </template>
    <template v-if="$slots.overlay" #overlay>
      <slot name="overlay" />
    </template>
  </UiTrackRow>
</template>
