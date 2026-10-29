<script setup>
// Self-contained like CaptureDeviceModal.vue/FeedbackReportModal.vue: this
// modal owns its composable directly rather than SettingsView.vue passing
// every field down as props, since useObsSessionExport() is a module
// singleton the trigger button (ObsIntegrationSettingsBlock.vue) can already
// open without prop drilling between unrelated components.
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { RefreshCw } from '../../icons/index.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
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
const offsetField = useTemplateRef('offsetField');
const content = useTemplateRef('content');
watch(
  () => exportState.isLoading.value,
  async (loading) => {
    if (loading || !exportState.isOpen.value) return;
    await nextTick();
    if (!exportState.isOpen.value) return;
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      const dialog = content.value?.closest('[role="dialog"]');
      if (
        active &&
        active !== document.body &&
        active !== dialog &&
        active !== content.value
      )
        return;
    }
    if (hasSession.value && !exportState.error.value)
      offsetField.value?.focus();
    else content.value?.focus();
  },
);
</script>

<template>
  <UiModal
    :open="exportState.isOpen.value"
    title="匯出場次時間軸"
    size="notice"
    max-block-size="small"
    @close="exportState.close()"
  >
    <template #header-actions>
      <UiIconButton
        :icon="RefreshCw"
        label="重新讀取場次"
        :loading="exportState.isLoading.value"
        @click="exportState.reload()"
      />
      <UiButton
        variant="accent"
        aria-label="複製章節"
        :disabled="!exportState.canCopy.value"
        @click="exportState.copyChapters()"
        >{{
          exportState.copyState.value.tone === 'success' ? '已複製' : '複製'
        }}</UiButton
      >
    </template>
    <div ref="content" class="obs-session-export-modal" tabindex="-1">
      <UiHint
        v-if="exportState.copyState.value.message"
        :tone="
          exportState.copyState.value.tone === 'error' ? 'danger' : 'muted'
        "
        :role="
          exportState.copyState.value.tone === 'error' ? 'alert' : 'status'
        "
        >{{ exportState.copyState.value.message }}</UiHint
      >
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
        並開始直播或錄影後，確認開始演出的曲目與標記會自動記錄。
      </p>

      <template v-else>
        <UiHint
          >場次：{{
            exportState.session.value.name ||
            exportState.session.value.id ||
            exportState.session.value.sessionId
          }}</UiHint
        >
        <UiHint
          v-if="
            exportState.session.value.entries.some(
              (entry) => !entry[exportState.source.value],
            )
          "
          tone="warning"
          >{{
            exportState.session.value.entries.filter(
              (entry) => !entry[exportState.source.value],
            ).length
          }}
          筆缺少所選來源的時間戳，未列入章節；原始場次紀錄仍保留。</UiHint
        >
        <div class="obs-session-export-modal__controls">
          <div class="obs-session-export-modal__source">
            <span class="obs-session-export-modal__label" aria-hidden="true"
              >時間來源</span
            >
            <UiSegmentedControl
              :model-value="exportState.source.value"
              :items="SOURCE_ITEMS"
              aria-label="時間來源"
              @update:model-value="exportState.source.value = $event"
            />
          </div>
          <UiTextField
            id="obs-session-export-offset"
            ref="offsetField"
            label="偏移量（秒）"
            :model-value="exportState.offsetSeconds.value"
            placeholder="0"
            inputmode="numeric"
            :error="exportState.offsetError.value"
            aria-describedby="obs-session-export-offset-hint"
            @update:model-value="exportState.offsetSeconds.value = $event"
          />
        </div>
        <UiHint id="obs-session-export-offset-hint"
          >用於校正 VOD 開頭，會從所有時間戳扣除。</UiHint
        >

        <UiDisclosure
          v-if="
            !exportState.offsetError.value &&
            exportState.result.value.issues.length
          "
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
          v-if="!exportState.offsetError.value"
          id="obs-session-export-text"
          label="YouTube 章節"
          :model-value="exportState.result.value.text"
          :rows="7"
          readonly
          hint="可選取文字後按 Ctrl+C 手動複製。"
        />
        <UiHint v-else>輸入有效偏移量後即可預覽及複製章節。</UiHint>
      </template>
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
.obs-session-export-modal:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-session-export-modal__status {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.obs-session-export-modal__controls {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-3);
}
.obs-session-export-modal__source {
  display: grid;
  gap: var(--ui-space-1);
}
.obs-session-export-modal__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}
</style>
