<script setup>
import { Check, RotateCcw, X } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import { t } from '../../utils/i18n.js';

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
  <div class="lyrics-timing" :aria-label="t('lyricsEditor.toolbar.label')">
    <div class="lyrics-timing__copy">
      <strong class="lyrics-timing__title">{{
        totalBoundaries > 0
          ? t('lyricsEditor.modes.word')
          : t('lyricsEditor.modes.line')
      }}</strong>
      <span v-if="totalBoundaries > 0" class="lyrics-timing__progress">
        {{
          t('lyricsEditor.toolbar.recorded', {
            done: completedBoundaries,
            total: totalBoundaries,
          })
        }}
      </span>
    </div>
    <div class="lyrics-timing__actions">
      <UiButton
        :icon="RotateCcw"
        :disabled="!canUndo || isSaving"
        :aria-label="t('lyricsEditor.toolbar.undoLabel')"
        :title="t('lyricsEditor.toolbar.undoLabel')"
        @click="$emit('undo')"
      >
        {{ t('lyricsEditor.toolbar.undo') }}
      </UiButton>
      <UiButton
        :icon="Check"
        variant="accent"
        :disabled="!canSave || isSaving"
        :loading="isSaving"
        :loading-label="t('common.saving')"
        :aria-label="t('lyricsEditor.toolbar.saveLabel')"
        :title="t('lyricsEditor.toolbar.saveLabel')"
        @click="$emit('save')"
      >
        {{ t('common.save') }}
      </UiButton>
      <UiButton
        :icon="X"
        :disabled="isSaving"
        :aria-label="t('lyricsEditor.toolbar.cancelLabel')"
        :title="t('lyricsEditor.toolbar.cancelLabel')"
        @click="$emit('cancel')"
      >
        {{ t('common.cancel') }}
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
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
}

.lyrics-timing__progress {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.lyrics-timing__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-2);
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
