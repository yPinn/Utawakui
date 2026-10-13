<script setup>
import { Minus, Plus } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import UiNotice from '../ui/UiNotice.vue';

defineProps({
  offsetLabel: { type: String, required: true },
  canReset: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['adjustOffset', 'resetOffset', 'retryOffset']);

function delayLyrics() {
  emit('adjustOffset', -0.1);
}

function advanceLyrics() {
  emit('adjustOffset', 0.1);
}

function resetLyricsOffset() {
  emit('resetOffset');
}
</script>

<template>
  <aside class="lyrics-live-controls" aria-label="即時同步">
    <UiNotice
      v-if="error"
      class="lyrics-live-controls__error"
      tone="danger"
      :message="error"
      action-label="重試"
      compact
      @action="emit('retryOffset')"
    />
    <UiButtonGroup
      class="lyrics-live-controls__panel"
      label="歌詞時間偏移"
      radius="lg"
      raised
    >
      <UiButton
        class="lyrics-live-controls__adjust"
        :icon="Minus"
        title="延後歌詞 0.1 秒"
        aria-label="延後 0.1 秒"
        @click="delayLyrics"
      >
        延後
      </UiButton>
      <UiButton
        class="lyrics-live-controls__value"
        :disabled="!canReset"
        title="重設歌詞時間偏移"
        aria-label="重設歌詞時間偏移"
        @click="resetLyricsOffset"
      >
        {{ offsetLabel }}
      </UiButton>
      <UiButton
        class="lyrics-live-controls__adjust"
        :icon="Plus"
        title="提前歌詞 0.1 秒"
        aria-label="提前 0.1 秒"
        @click="advanceLyrics"
      >
        提前
      </UiButton>
    </UiButtonGroup>
  </aside>
</template>

<style scoped>
.lyrics-live-controls {
  position: absolute;
  right: var(--ui-space-4);
  bottom: var(--ui-space-4);
  z-index: var(--ui-layer-overlay);
  display: grid;
  justify-items: end;
  gap: var(--ui-space-2);
}

.lyrics-live-controls__error {
  max-width: 24rem;
}

.lyrics-live-controls__adjust,
.lyrics-live-controls__value {
  min-height: var(--ui-lyrics-live-control-height);
}

.lyrics-live-controls__adjust {
  min-width: var(--ui-lyrics-live-action-width);
  justify-content: center;
  color: var(--ui-color-text);
}

.lyrics-live-controls__value {
  justify-content: center;
  min-width: var(--ui-lyrics-live-display-width);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-variant-numeric: tabular-nums;
  text-align: center;
  user-select: none;
}

.lyrics-live-controls__value:disabled {
  color: var(--ui-color-text-muted);
  opacity: 1;
}
</style>
