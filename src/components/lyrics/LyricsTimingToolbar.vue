<script setup>
import { Check, RotateCcw, X } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';

defineProps({
  canUndo: { type: Boolean, default: false },
  canSave: { type: Boolean, default: false },
  completedBoundaries: { type: Number, default: 0 },
  totalBoundaries: { type: Number, default: 0 },
  isSaving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

defineEmits(['undo', 'save', 'cancel']);
</script>

<template>
  <div class="lyrics-timing" aria-label="逐字時間工具">
    <div class="lyrics-timing__copy">
      <strong class="lyrics-timing__title">逐字校時</strong>
      <span class="lyrics-timing__progress">
        已記錄 {{ completedBoundaries }} / {{ totalBoundaries }}
      </span>
    </div>
    <div class="lyrics-timing__actions">
      <UiButton
        :icon="RotateCcw"
        :disabled="!canUndo || isSaving"
        aria-label="復原逐字時間"
        title="復原逐字時間"
        @click="$emit('undo')"
      >
        復原
      </UiButton>
      <UiButton
        :icon="Check"
        variant="accent"
        :disabled="!canSave || isSaving"
        aria-label="儲存逐字時間"
        title="儲存逐字時間"
        @click="$emit('save')"
      >
        儲存
      </UiButton>
      <UiButton
        :icon="X"
        :disabled="isSaving"
        aria-label="取消逐字編輯"
        title="取消逐字編輯"
        @click="$emit('cancel')"
      >
        取消
      </UiButton>
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2) var(--ui-space-4);
  min-width: 0;
  padding: var(--ui-space-2) var(--ui-space-4);
  background: var(--ui-color-surface-raised);
}

.lyrics-timing__copy {
  display: grid;
  gap: var(--ui-space-1);
  min-width: 0;
}

.lyrics-timing__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.lyrics-timing__progress {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-timing__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

.lyrics-timing__error {
  grid-column: 1 / -1;
}

@container (max-width: 42rem) {
  .lyrics-timing {
    grid-template-columns: 1fr;
  }

  .lyrics-timing__actions {
    justify-content: flex-start;
  }
}
</style>
