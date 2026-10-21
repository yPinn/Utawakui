<script setup>
// A track's artist line where each credited artist opens its artist page
// (ADR 0022). Unpairable credits stay plain text instead of guessing links.
import { computed } from 'vue';
import { useAlbumNavigation } from '../../composables/useAlbumNavigation.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { artistCreditLinks } from '../../utils/artistPage.js';
import UiTextButton from '../ui/UiTextButton.vue';

const props = defineProps({
  track: { type: Object, required: true },
  navigable: { type: Boolean, default: true },
});

// `navigate` lets a host surface (e.g. a dialog) dismiss itself first.
const emit = defineEmits(['navigate']);

const { state: artistIndexState } = useArtistIndex();
const { jumpToArtist } = useAlbumNavigation();

function openArtist(artistId) {
  emit('navigate', artistId);
  jumpToArtist(artistId);
}

const links = computed(() => {
  if (!props.navigable) {
    const text = props.track.artist ?? '';
    return text ? [{ text, artistId: '' }] : [];
  }
  const paired = artistCreditLinks(props.track, artistIndexState.index);
  if (paired) return paired;
  const text = props.track.artist ?? '';
  return text ? [{ text, artistId: '' }] : [];
});
</script>

<template>
  <span v-if="links.length > 0" class="track-artist-credits">
    <template v-for="(link, index) in links" :key="`${index}:${link.text}`">
      <span v-if="index > 0" class="track-artist-credits__separator">, </span>
      <UiTextButton
        v-if="link.artistId && navigable"
        class="track-artist-credits__link"
        :text="link.text"
        overflow="ellipsis"
        :aria-label="`前往藝人：${link.text}`"
        @click="openArtist(link.artistId)"
        @dblclick.stop
      />
      <span v-else class="track-artist-credits__text">{{ link.text }}</span>
    </template>
  </span>
</template>

<style scoped>
/* One ellipsizing line: every credit may shrink, separators never do. */
.track-artist-credits {
  display: flex;
  align-items: baseline;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.track-artist-credits__link,
.track-artist-credits__text {
  flex: 0 1 auto;
  min-width: 0;
}

/* UiTextButton leaves font-weight to its caller. */
.track-artist-credits__link {
  font-weight: inherit;
}

.track-artist-credits__text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-artist-credits__separator {
  flex: none;
  white-space: pre;
}
</style>
