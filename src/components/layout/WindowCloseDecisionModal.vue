<script setup>
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';

defineProps({
  open: { type: Boolean, default: false },
  remember: { type: Boolean, default: false },
  isResponding: { type: Boolean, default: false },
  pendingAction: { type: String, default: '' },
  error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'decision', 'update:remember']);
</script>

<template>
  <UiModal
    :open="open"
    title="關閉 Utawakui"
    size="notice"
    @close="emit('close')"
  >
    <div class="window-close-decision">
      <div class="window-close-decision__copy">
        <p class="window-close-decision__question">
          要讓 Utawakui 在背景繼續執行嗎？
        </p>
        <p class="window-close-decision__detail">
          背景執行會保留播放、OBS 連線與輸出；你可以從系統匣再次開啟或完整結束。
        </p>
      </div>

      <UiCheckbox
        id="window-close-remember"
        :model-value="remember"
        label="記住我的選擇"
        :disabled="isResponding"
        @update:model-value="emit('update:remember', $event)"
      />

      <UiNotice
        v-if="error"
        tone="danger"
        title="關閉操作未完成"
        :message="error"
        compact
      />

      <div class="window-close-decision__actions">
        <UiButton :disabled="isResponding" @click="emit('close')">
          取消
        </UiButton>
        <UiButton
          :disabled="isResponding"
          :loading="pendingAction === 'quit'"
          loading-label="結束中"
          @click="emit('decision', 'quit')"
        >
          完全結束
        </UiButton>
        <UiButton
          variant="accent"
          :disabled="isResponding"
          :loading="pendingAction === 'tray'"
          loading-label="處理中"
          @click="emit('decision', 'tray')"
        >
          在背景執行
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
  line-height: var(--ui-line-height-body);
}

.window-close-decision__question {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
}

.window-close-decision__detail {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.window-close-decision__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
