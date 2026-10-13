<script setup>
import { Music2 } from '../../icons/index.js';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

defineProps({
  track: { type: Object, default: null },
});
</script>

<template>
  <div class="bgm-current-source" aria-label="目前 BGM">
    <UiTrackThumb
      :track="track"
      class="bgm-current-source__artwork"
      size="var(--ui-bgm-player-artwork-size)"
      radius="var(--ui-radius-sm)"
    >
      <Music2 aria-hidden="true" />
    </UiTrackThumb>
    <div class="bgm-current-source__copy">
      <strong>{{ track?.title ?? '尚未選擇 BGM' }}</strong>
    </div>
  </div>
</template>

<style scoped>
.bgm-current-source {
  display: flex;
  block-size: var(--ui-bgm-player-artwork-size);
  min-inline-size: 0;
  align-items: center;
  gap: var(--ui-space-2);
}

.bgm-current-source__copy {
  display: flex;
  min-inline-size: 0;
  flex: 1;
  flex-direction: column;
}

.bgm-current-source__copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-label-line-height);
}

.bgm-current-source__artwork :deep(svg) {
  width: var(--ui-space-5);
  height: var(--ui-space-5);
  color: var(--ui-color-text-muted);
}
</style>
