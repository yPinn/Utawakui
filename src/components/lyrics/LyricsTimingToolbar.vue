<script setup>
import { Check, Clock, RotateCcw, X } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';

defineProps({
  granularity: { type: String, default: 'T0' },
  hasDraft: { type: Boolean, default: false },
  canTap: { type: Boolean, default: false },
  canUndo: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

defineEmits(['tap', 'undo', 'save', 'cancel']);
</script>

<template>
  <div class="lyrics-timing" aria-label="逐字時間工具">
    <span class="lyrics-timing__status">
      時間顆粒度 {{ granularity }}
      <template v-if="!hasDraft">／點選歌詞行右側時鐘開始校時</template>
    </span>
    <div v-if="hasDraft" class="lyrics-timing__actions">
      <UiButton
        :icon="Clock"
        :disabled="!canTap || isSaving"
        aria-label="記錄目前播放位置"
        title="記錄目前播放位置"
        @click="$emit('tap')"
      />
      <UiButton
        :icon="RotateCcw"
        :disabled="!canUndo || isSaving"
        aria-label="復原逐字時間"
        title="復原逐字時間"
        @click="$emit('undo')"
      />
      <UiButton
        :icon="Check"
        variant="accent"
        :disabled="!canSave || isSaving"
        aria-label="儲存逐字時間"
        title="儲存逐字時間"
        @click="$emit('save')"
      />
      <UiButton
        :icon="X"
        :disabled="isSaving"
        aria-label="取消逐字編輯"
        title="取消逐字編輯"
        @click="$emit('cancel')"
      />
    </div>
    <UiNotice
      v-if="error"
      class="lyrics-timing__error"
      tone="danger"
      :message="error"
      compact
    />
  </div>
</template>

<style scoped>
.lyrics-timing {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
  padding: var(--ui-space-1) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
}

.lyrics-timing__status {
  min-width: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-xs);
}

.lyrics-timing__actions {
  display: flex;
  gap: var(--ui-space-1);
  margin-left: auto;
}

.lyrics-timing__error {
  flex: 1 1 240px;
}
</style>
