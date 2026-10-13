<script setup>
import { computed } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  remember: { type: Boolean, default: false },
  isResponding: { type: Boolean, default: false },
  pendingAction: { type: String, default: '' },
  activeWork: { type: String, default: '' },
  presentation: { type: String, default: 'decision' },
  errorTitle: { type: String, default: '' },
  error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'decision', 'update:remember']);
const hasActiveSeparation = computed(() => props.activeWork === 'separation');
const isErrorPresentation = computed(() => props.presentation === 'error');
const modalTitle = computed(() =>
  isErrorPresentation.value
    ? props.errorTitle || '關閉操作未完成'
    : hasActiveSeparation.value
      ? '伴奏處理中'
      : '關閉 Utawakui',
);
</script>

<template>
  <UiModal
    :open="open"
    :title="modalTitle"
    size="notice"
    @close="emit('close')"
  >
    <div class="window-close-decision">
      <UiNotice
        v-if="isErrorPresentation"
        tone="danger"
        :title="errorTitle"
        :message="error"
        compact
      />

      <div v-else class="window-close-decision__copy">
        <p class="window-close-decision__question">
          {{
            hasActiveSeparation
              ? '要在背景繼續處理嗎？'
              : '要在背景繼續執行嗎？'
          }}
        </p>
        <p class="window-close-decision__detail">
          {{
            hasActiveSeparation
              ? '停止會取消目前歌曲，其餘排程不保留。'
              : '播放、OBS 連線與輸出會保留，可從系統匣開啟或結束。'
          }}
        </p>
      </div>

      <UiCheckbox
        v-if="!isErrorPresentation && !hasActiveSeparation"
        id="window-close-remember"
        :model-value="remember"
        label="記住選擇"
        :disabled="isResponding"
        @update:model-value="emit('update:remember', $event)"
      />

      <UiNotice
        v-if="!isErrorPresentation && error"
        tone="danger"
        title="關閉操作未完成"
        :message="error"
        compact
      />

      <div class="window-close-decision__actions">
        <UiButton
          v-if="isErrorPresentation"
          variant="accent"
          @click="emit('close')"
        >
          知道了
        </UiButton>
        <UiButton
          v-if="!isErrorPresentation"
          :disabled="isResponding"
          @click="emit('close')"
        >
          取消
        </UiButton>
        <UiButton
          v-if="!isErrorPresentation"
          :intent="hasActiveSeparation ? 'danger' : 'neutral'"
          :disabled="isResponding"
          :loading="pendingAction === 'quit'"
          loading-label="結束中"
          @click="emit('decision', 'quit')"
        >
          {{ hasActiveSeparation ? '停止並結束' : '結束' }}
        </UiButton>
        <UiButton
          v-if="!isErrorPresentation"
          variant="accent"
          :disabled="isResponding"
          :loading="pendingAction === 'tray'"
          loading-label="處理中"
          @click="emit('decision', 'tray')"
        >
          {{ hasActiveSeparation ? '在背景繼續' : '背景執行' }}
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.window-close-decision {
  display: grid;
  gap: var(--ui-space-4);
}

.window-close-decision__copy {
  display: grid;
  gap: var(--ui-space-2);
}

.window-close-decision__question,
.window-close-decision__detail {
  margin: 0;
  line-height: var(--ui-type-body-line-height);
}

.window-close-decision__question {
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-font-weight-semibold);
}

.window-close-decision__detail {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
}

.window-close-decision__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
