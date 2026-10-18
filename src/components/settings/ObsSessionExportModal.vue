<script setup>
// Self-contained like CaptureDeviceModal.vue/FeedbackReportModal.vue: this
// modal owns its composable directly rather than SettingsView.vue passing
// every field down as props, since useObsSessionExport() is a module
// singleton the trigger button (ObsIntegrationSettingsBlock.vue) can already
// open without prop drilling between unrelated components.
import { computed } from 'vue';
import { RefreshCw } from '../../icons/index.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const exportState = useObsSessionExport();

const SOURCE_ITEMS = Object.freeze([
  { id: 'stream', label: '直播' },
  { id: 'record', label: '錄影' },
]);

const hasSession = computed(
  () => (exportState.session.value?.entries?.length ?? 0) > 0,
);
</script>

<template>
  <UiModal
    :open="exportState.isOpen.value"
    title="匯出場次時間軸"
    size="wide"
    @close="exportState.close()"
  >
    <div class="obs-session-export-modal">
      <p
        v-if="exportState.isLoading.value"
        class="obs-session-export-modal__status"
      >
        正在讀取場次紀錄…
      </p>

      <UiNotice
        v-else-if="exportState.error.value"
        tone="danger"
        :message="exportState.error.value"
        compact
      />

      <p v-else-if="!hasSession" class="obs-session-export-modal__status">
        沒有可匯出的紀錄。連線 OBS
        並開始直播或錄影後，曲目切換與標記會自動記錄。
      </p>

      <template v-else>
        <div class="obs-session-export-modal__controls">
          <UiSegmentedControl
            :model-value="exportState.source.value"
            :items="SOURCE_ITEMS"
            aria-label="時間來源"
            @update:model-value="exportState.source.value = $event"
          />
          <UiTextField
            id="obs-session-export-offset"
            label="偏移量（秒）"
            :model-value="exportState.offsetSeconds.value"
            placeholder="0"
            hint="用於校正 VOD 開頭，會從所有時間戳扣除。"
            @update:model-value="exportState.offsetSeconds.value = $event"
          />
        </div>

        <UiDisclosure
          v-if="exportState.result.value.issues.length"
          :label="`章節有 ${exportState.result.value.issues.length} 項需確認`"
        >
          <UiHint tone="warning">時間戳未自動調整，請確認以下問題。</UiHint>
          <ul class="obs-session-export-modal__issues">
            <li
              v-for="(issue, index) in exportState.result.value.issues"
              :key="`${issue.code}-${index}`"
            >
              {{ issue.message }}
            </li>
          </ul>
        </UiDisclosure>

        <UiTextarea
          id="obs-session-export-text"
          label="YouTube 章節"
          :model-value="exportState.result.value.text"
          :rows="10"
          readonly
          hint="可選取文字後按 Ctrl+C 手動複製。"
        />

        <div class="obs-session-export-modal__actions">
          <UiButton
            variant="accent"
            :disabled="!exportState.result.value.text"
            @click="exportState.copyChapters()"
          >
            複製章節
          </UiButton>
          <span
            v-if="exportState.copyState.value.message"
            class="obs-session-export-modal__copy-feedback"
            role="status"
            >{{ exportState.copyState.value.message }}</span
          >
        </div>
      </template>
      <UiButton
        :icon="RefreshCw"
        variant="ghost"
        :loading="exportState.isLoading.value"
        @click="exportState.open()"
        >重新讀取場次</UiButton
      >
    </div>
  </UiModal>
</template>

<style scoped>
.obs-session-export-modal__issues {
  margin: var(--ui-space-2) 0 0;
  padding-inline-start: var(--ui-space-5);
  color: var(--ui-color-warning);
  font-size: var(--ui-type-caption-size);
}

.obs-session-export-modal {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.obs-session-export-modal__status {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-line-height);
}

.obs-session-export-modal__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: var(--ui-space-2);
}

.obs-session-export-modal__actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.obs-session-export-modal__copy-feedback {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}
</style>
