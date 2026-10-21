<script setup>
import PlaybackTrackIdentity from '../track/PlaybackTrackIdentity.vue';
import UiTrackArtworkButton from '../ui/UiTrackArtworkButton.vue';
import RightDockTrackArtworkCue from '../queue/RightDockTrackArtworkCue.vue';

defineProps({
  track: { type: Object, default: null },
  playbackAction: { type: Object, default: null },
});
const emit = defineEmits(['activate']);
</script>

<template>
  <PlaybackTrackIdentity
    class="bgm-current-source"
    aria-label="目前 BGM"
    :track="track"
    artwork-size="var(--ui-track-row-thumb-size)"
    empty-label="尚未選擇 BGM"
    data-artwork-reveal-scope="focus-within"
  >
    <template v-if="playbackAction && track" #artwork>
      <UiTrackArtworkButton
        class="bgm-current-source__playback"
        :track="track"
        :label="playbackAction.label"
        :disabled="playbackAction.disabled"
        @activate="emit('activate')"
      >
        <template #overlay>
          <RightDockTrackArtworkCue
            :playing="playbackAction.intent === 'pause'"
          />
        </template>
      </UiTrackArtworkButton>
    </template>
  </PlaybackTrackIdentity>
</template>

<style scoped>
.bgm-current-source {
  display: flex;
  min-block-size: var(--ui-track-row-min-height);
  block-size: var(--ui-track-row-min-height);
  padding: var(--ui-track-row-padding-block) var(--ui-track-row-padding-inline);
  min-inline-size: 0;
  align-items: center;
  gap: var(--ui-track-row-gap);
}
</style>
