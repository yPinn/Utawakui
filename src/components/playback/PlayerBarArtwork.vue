<script setup>
import { computed } from 'vue';
import { PLAYER_BAR_ARTWORK_SIZE } from '../../constants/ui.js';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  track: { type: Object, required: true },
  expandable: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  controls: { type: String, default: undefined },
});

const emit = defineEmits(['activate']);
const actionLabel = computed(() =>
  props.expanded ? '摺疊目前歌曲資料' : '展開目前歌曲資料',
);
</script>

<template>
  <button
    v-if="expandable"
    type="button"
    class="player-bar-artwork player-bar-artwork--interactive"
    :aria-label="actionLabel"
    :title="actionLabel"
    :aria-expanded="expanded"
    :aria-controls="controls"
    @click="emit('activate')"
  >
    <UiTrackThumb
      :track="track"
      :size="PLAYER_BAR_ARTWORK_SIZE"
      font-size="var(--ui-font-size-lg)"
    />
  </button>
  <UiTrackThumb
    v-else
    class="player-bar-artwork"
    :track="track"
    :size="PLAYER_BAR_ARTWORK_SIZE"
    font-size="var(--ui-font-size-lg)"
  />
</template>

<style scoped>
.player-bar-artwork {
  flex: 0 0 auto;
}

.player-bar-artwork--interactive {
  display: inline-flex;
  padding: 0;
  border: 0;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.player-bar-artwork--interactive:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
</style>
