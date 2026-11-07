<script setup>
import PlaybackTrackIdentity from '../track/PlaybackTrackIdentity.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  track: { type: Object, default: null },
  playbackAction: { type: Object, default: null },
  compactEmpty: { type: Boolean, default: false },
});
const emit = defineEmits(['activate']);
</script>

<template>
  <PlaybackTrackIdentity
    class="bgm-current-source"
    :aria-label="t('bgm.current')"
    :track="track"
    artwork-size="var(--ui-track-row-thumb-size)"
    :empty-label="t(compactEmpty ? 'bgm.noneShort' : 'bgm.none')"
  >
    <template v-if="playbackAction && track" #artwork>
      <div class="bgm-current-source__artwork">
        <UiTrackThumb :track="track" size="var(--ui-track-row-thumb-size)" />
        <UiIconButton
          v-show="!playbackAction.disabled"
          class="bgm-current-source__playback"
          :icon="playbackAction.icon"
          :label="playbackAction.label"
          :disabled="playbackAction.disabled"
          variant="overlay"
          shape="circle"
          fill
          @click.stop="emit('activate')"
          @dblclick.stop
        />
      </div>
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

.bgm-current-source__artwork {
  position: relative;
  display: grid;
  flex: none;
}

.bgm-current-source__playback {
  --ui-icon-button-size-override: var(--ui-space-6);
  position: absolute;
  inset: 0;
  margin: auto;
}

/* The centered circle keeps the whole cover as its hit target. */
.bgm-current-source__playback::before {
  position: absolute;
  inset: calc(
    (var(--ui-icon-button-size-override) - var(--ui-track-row-thumb-size)) / 2
  );
  content: '';
}
</style>
