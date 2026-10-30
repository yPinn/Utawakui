<script setup>
import { computed, shallowRef, useTemplateRef } from 'vue';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { trackArtistText } from '../../utils/artistPage.js';
import UiTrackRow from '../ui/UiTrackRow.vue';
import RightDockTrackArtworkCue from '../queue/RightDockTrackArtworkCue.vue';
import TrackContextActions from '../playback/context/TrackContextActions.vue';

const props = defineProps({
  track: { type: Object, required: true },
  versionLabel: { type: String, default: '' },
  beforeNavigate: { type: Function, default: null },
});
const emit = defineEmits(['play']);
const { state: artistIndexState } = useArtistIndex();
const actions = useTemplateRef('actions');
const menuOpen = shallowRef(false);
const subtitle = computed(() =>
  [trackArtistText(props.track, artistIndexState.index), props.versionLabel]
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <UiTrackRow
    :track="track"
    :artist="subtitle"
    :aria-description="subtitle"
    overflow="ellipsis"
    hide-duration
    artwork-clickable
    :artwork-label="`播放 ${track.title}`"
    state-surface
    :state-surface-active="menuOpen"
    data-artwork-reveal-scope="focus-within"
    @artwork-click="emit('play', track)"
    @contextmenu.prevent.stop="actions?.open($event)"
  >
    <template #artworkOverlay><RightDockTrackArtworkCue /></template>
    <template #trail>
      <TrackContextActions
        ref="actions"
        :track="track"
        context="source"
        trigger="inline"
        :before-navigate="beforeNavigate"
        @open-change="menuOpen = $event"
      />
    </template>
  </UiTrackRow>
</template>
