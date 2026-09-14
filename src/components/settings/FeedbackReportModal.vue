<script setup>
// Self-contained like CaptureDeviceModal.vue: this modal owns its own
// composable rather than SettingsView.vue passing every field down as
// props, since useFeedbackReport() is a module singleton any entry point
// (an error notice's action, this general Settings row) can already open
// without prop drilling.
import { computed } from 'vue';
import { formatFeedbackReportReference } from '../../../shared/feedbackReference.mjs';
import {
  DIAGNOSTICS_ALLOWED_KINDS,
  FEEDBACK_KIND_OPTIONS,
  FEEDBACK_KINDS,
  MAX_CONTACT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_TRACK_LABEL_LENGTH,
} from '../../constants/feedback.js';
import { useFeedbackReport } from '../../composables/useFeedbackReport.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const {
  state,
  closeReport,
  updateDraft,
  goToPreview,
  backToCompose,
  submitReport,
  exportFallback,
} = useFeedbackReport();

const reportReference = computed(() =>
  formatFeedbackReportReference(state.reportId),
);

function kindLabel(kind) {
  return (
    FEEDBACK_KIND_OPTIONS.find((option) => option.value === kind)?.label || kind
  );
}

function handleNoticeAction(operation) {
  if (operation === 'preview') {
    goToPreview();
    return;
  }
  if (operation === 'submit' || operation === 'export-fallback') {
    exportFallback();
  }
}
</script>

<template>
  <UiModal
    :open="state.open"
    title="意見回饋"
    size="notice"
    @close="closeReport"
  >
    <div class="feedback-report">
      <template v-if="state.step === 'compose'">
        <p class="feedback-report__intro">
          告訴我們錯誤、想要的功能，或任何使用上的想法。送出前你會先看到完整內容再確認。
        </p>

        <UiSelect
          id="feedback-kind"
          label="類別"
          :model-value="state.kind"
          :options="FEEDBACK_KIND_OPTIONS"
          @update:model-value="(value) => updateDraft({ kind: value })"
        />

        <UiTextarea
          id="feedback-description"
          label="說明"
          :model-value="state.description"
          :maxlength="MAX_DESCRIPTION_LENGTH"
          :rows="6"
          placeholder="發生了什麼事？你原本想做什麼、實際上看到什麼？"
          required
          @update:model-value="(value) => updateDraft({ description: value })"
        />

        <UiTextField
          v-if="state.kind === FEEDBACK_KINDS.CONTENT"
          id="feedback-track-label"
          label="歌曲資訊（選填）"
          :model-value="state.trackLabel"
          :maxlength="MAX_TRACK_LABEL_LENGTH"
          placeholder="歌手 - 歌名"
          @update:model-value="(value) => updateDraft({ trackLabel: value })"
        />

        <UiCheckbox
          v-if="DIAGNOSTICS_ALLOWED_KINDS.has(state.kind)"
          id="feedback-include-diagnostics"
          label="附上最近的錯誤紀錄，幫助我們排查"
          :model-value="state.includeDiagnostics"
          @update:model-value="
            (value) => updateDraft({ includeDiagnostics: value })
          "
        />

        <UiTextField
          id="feedback-contact"
          label="聯絡方式（選填）"
          :model-value="state.contact"
          :maxlength="MAX_CONTACT_LENGTH"
          hint="方便我們在需要時回覆你，例如 Discord 帳號或 email。"
          placeholder="不留也沒關係"
          @update:model-value="(value) => updateDraft({ contact: value })"
        />

        <UiNotice
          v-if="state.notice"
          :notice="state.notice"
          compact
          @action="handleNoticeAction(state.notice.operation)"
        />

        <div class="feedback-report__actions">
          <UiButton
            variant="ghost"
            :disabled="state.isLoading"
            @click="closeReport"
          >
            取消
          </UiButton>
          <UiButton
            variant="accent"
            :loading="state.isLoading"
            @click="goToPreview"
          >
            預覽
          </UiButton>
        </div>
      </template>

      <template v-else-if="state.step === 'preview'">
        <p class="feedback-report__intro">
          這是即將送出的內容，確認沒問題再送出。
        </p>

        <dl class="feedback-report__summary">
          <div class="feedback-report__row">
            <dt>類別</dt>
            <dd>{{ kindLabel(state.previewPayload?.kind) }}</dd>
          </div>
          <div class="feedback-report__row">
            <dt>說明</dt>
            <dd class="feedback-report__description">
              {{ state.previewPayload?.description }}
            </dd>
          </div>
          <div
            v-if="state.previewPayload?.trackLabel"
            class="feedback-report__row"
          >
            <dt>歌曲資訊</dt>
            <dd>{{ state.previewPayload.trackLabel }}</dd>
          </div>
          <div
            v-if="state.previewPayload?.contact"
            class="feedback-report__row"
          >
            <dt>聯絡方式</dt>
            <dd>{{ state.previewPayload.contact }}</dd>
          </div>
          <div class="feedback-report__row">
            <dt>環境資訊</dt>
            <dd>
              App {{ state.previewPayload?.environment?.appVersion }}・
              {{ state.previewPayload?.environment?.platform }}
            </dd>
          </div>
          <div
            v-if="state.previewPayload?.diagnostics"
            class="feedback-report__row"
          >
            <dt>錯誤紀錄</dt>
            <dd>
              已附上最近
              {{ state.previewPayload.diagnostics.eventCount }}
              筆事件記錄
            </dd>
          </div>
        </dl>

        <UiNotice
          v-if="state.notice"
          :notice="state.notice"
          compact
          @action="handleNoticeAction(state.notice.operation)"
        />

        <div class="feedback-report__actions">
          <UiButton
            variant="ghost"
            :disabled="state.isLoading"
            @click="backToCompose"
          >
            上一步
          </UiButton>
          <UiButton
            variant="accent"
            :loading="state.isLoading"
            @click="submitReport"
          >
            確認送出
          </UiButton>
        </div>
      </template>

      <template v-else-if="state.step === 'result'">
        <p class="feedback-report__intro">已收到你的回饋，謝謝！</p>
        <p v-if="reportReference" class="feedback-report__report-id">
          回報碼：{{ reportReference }}
        </p>

        <div class="feedback-report__actions">
          <UiButton variant="accent" @click="closeReport">完成</UiButton>
        </div>
      </template>
    </div>
  </UiModal>
</template>

<style scoped>
.feedback-report {
  display: grid;
  gap: var(--ui-space-4);
}

.feedback-report__intro {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
}

.feedback-report__summary {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}

.feedback-report__row {
  display: grid;
  gap: var(--ui-space-1);
}

.feedback-report__row dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-xs);
}

.feedback-report__row dd {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-body);
  overflow-wrap: anywhere;
}

.feedback-report__description {
  white-space: pre-wrap;
}

.feedback-report__report-id {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  -webkit-user-select: text;
  user-select: text;
}

.feedback-report__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
</style>
