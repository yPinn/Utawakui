<script setup>
import { t } from '../../utils/i18n.js';
// Self-contained like CaptureDeviceModal.vue: this modal owns its own
// composable rather than SettingsView.vue passing every field down as
// props, since useFeedbackReport() is a module singleton any entry point
// (an error notice's action, this general Settings row) can already open
// without prop drilling.
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { ArrowLeft, Download } from '../../icons/index.js';
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
import { summarizeFeedbackDiagnostics } from '../../utils/feedbackDiagnosticsSummary.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiIconButton from '../ui/UiIconButton.vue';
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

const diagnosticsSummary = computed(() =>
  summarizeFeedbackDiagnostics(state.previewPayload?.diagnostics),
);

const descriptionField = useTemplateRef('descriptionField');
const previewSummary = useTemplateRef('previewSummary');
const resultMessage = useTemplateRef('resultMessage');
function focusCurrentStep() {
  if (state.step === 'compose') descriptionField.value?.focus();
  else if (state.step === 'preview') previewSummary.value?.focus();
  else if (state.step === 'result') resultMessage.value?.focus();
}
watch(
  () => state.step,
  async () => {
    if (!state.open) return;
    await nextTick();
    if (!state.open) return;
    focusCurrentStep();
  },
);
watch(
  () => state.isLoading,
  async (loading) => {
    if (loading || !state.open || typeof document === 'undefined') return;
    await nextTick();
    if (state.open && document.activeElement === document.body)
      focusCurrentStep();
  },
);
watch(
  () => state.validationAttempt,
  async () => {
    if (!state.descriptionError) return;
    await nextTick();
    descriptionField.value?.focus();
  },
);

const reportReference = computed(() =>
  formatFeedbackReportReference(state.reportId),
);
const visibleNotice = computed(() =>
  state.notice ? { ...state.notice, actionLabel: '' } : null,
);

function kindLabel(kind) {
  return (
    FEEDBACK_KIND_OPTIONS.find((option) => option.value === kind)?.label || kind
  );
}

const DESCRIPTION_PLACEHOLDER_BY_KIND = {
  [FEEDBACK_KINDS.BUG]: t('feedback.prompts.bug'),
  [FEEDBACK_KINDS.FEATURE]: t('feedback.prompts.feature'),
  [FEEDBACK_KINDS.EXPERIENCE]: t('feedback.prompts.experience'),
  [FEEDBACK_KINDS.CONTENT]: t('feedback.prompts.content'),
};

const descriptionPlaceholder = computed(
  () =>
    DESCRIPTION_PLACEHOLDER_BY_KIND[state.kind] ||
    DESCRIPTION_PLACEHOLDER_BY_KIND[FEEDBACK_KINDS.BUG],
);
</script>

<template>
  <UiModal
    :open="state.open"
    :title="t('feedback.title')"
    size="notice"
    max-block-size="small"
    @close="closeReport"
  >
    <template v-if="state.step !== 'result'" #header-actions>
      <UiButton
        v-if="state.step === 'compose'"
        variant="accent"
        :loading="state.isLoading"
        @click="goToPreview"
        >{{ t('feedback.preview') }}</UiButton
      >
      <template v-else-if="state.step === 'preview'">
        <UiIconButton
          :icon="ArrowLeft"
          :label="t('feedback.backToEdit')"
          :disabled="state.isLoading"
          @click="backToCompose"
        />
        <UiIconButton
          :icon="Download"
          :label="t('feedback.saveFile')"
          :disabled="state.isLoading"
          @click="exportFallback"
        />
        <UiButton
          variant="accent"
          :aria-label="t('feedback.submitLabel')"
          :loading="state.isLoading"
          @click="submitReport"
          >{{ t('feedback.submit') }}</UiButton
        >
      </template>
    </template>
    <div class="feedback-report">
      <template v-if="state.step === 'compose'">
        <p class="feedback-report__intro">
          {{ t('feedback.composeIntro') }}
        </p>

        <UiSelect
          id="feedback-kind"
          :disabled="state.isLoading"
          :label="t('feedback.kind')"
          :model-value="state.kind"
          :options="FEEDBACK_KIND_OPTIONS"
          @update:model-value="(value) => updateDraft({ kind: value })"
        />

        <UiTextarea
          id="feedback-description"
          ref="descriptionField"
          :disabled="state.isLoading"
          :error="state.descriptionError"
          :label="t('feedback.description')"
          :model-value="state.description"
          :maxlength="MAX_DESCRIPTION_LENGTH"
          :rows="4"
          :placeholder="descriptionPlaceholder"
          required
          @update:model-value="(value) => updateDraft({ description: value })"
        />

        <UiTextField
          v-if="state.kind === FEEDBACK_KINDS.CONTENT"
          id="feedback-track-label"
          :disabled="state.isLoading"
          :label="t('feedback.track')"
          :model-value="state.trackLabel"
          :maxlength="MAX_TRACK_LABEL_LENGTH"
          :placeholder="t('feedback.trackPlaceholder')"
          @update:model-value="(value) => updateDraft({ trackLabel: value })"
        />

        <UiCheckbox
          v-if="DIAGNOSTICS_ALLOWED_KINDS.has(state.kind)"
          id="feedback-include-diagnostics"
          :disabled="state.isLoading"
          :label="t('feedback.attachDiagnostics')"
          :model-value="state.includeDiagnostics"
          @update:model-value="
            (value) => updateDraft({ includeDiagnostics: value })
          "
        />

        <UiTextField
          id="feedback-contact"
          :disabled="state.isLoading"
          :label="t('feedback.contact')"
          :model-value="state.contact"
          :maxlength="MAX_CONTACT_LENGTH"
          :hint="t('feedback.contactHint')"
          :placeholder="t('feedback.contactPlaceholder')"
          @update:model-value="(value) => updateDraft({ contact: value })"
        />

        <UiNotice v-if="state.notice" :notice="visibleNotice" compact />
      </template>

      <template v-else-if="state.step === 'preview'">
        <p class="feedback-report__intro">{{ t('feedback.previewIntro') }}</p>

        <dl
          ref="previewSummary"
          class="feedback-report__summary"
          tabindex="-1"
          :aria-label="t('feedback.previewLabel')"
        >
          <div class="feedback-report__row">
            <dt>{{ t('feedback.kind') }}</dt>
            <dd>{{ kindLabel(state.previewPayload?.kind) }}</dd>
          </div>
          <div class="feedback-report__row">
            <dt>{{ t('feedback.description') }}</dt>
            <dd class="feedback-report__description">
              {{ state.previewPayload?.description }}
            </dd>
          </div>
          <div
            v-if="state.previewPayload?.trackLabel"
            class="feedback-report__row"
          >
            <dt>{{ t('feedback.trackHeading') }}</dt>
            <dd>{{ state.previewPayload.trackLabel }}</dd>
          </div>
          <div
            v-if="state.previewPayload?.contact"
            class="feedback-report__row"
          >
            <dt>{{ t('feedback.contactHeading') }}</dt>
            <dd>{{ state.previewPayload.contact }}</dd>
          </div>
          <div class="feedback-report__row">
            <dt>{{ t('feedback.environment') }}</dt>
            <dd>
              {{
                t('feedback.environmentValue', {
                  version: state.previewPayload?.environment?.appVersion,
                  platform: state.previewPayload?.environment?.platform,
                })
              }}
            </dd>
          </div>
          <div
            v-if="state.previewPayload?.diagnostics"
            class="feedback-report__row"
          >
            <dt>{{ t('feedback.diagnosticsHeading') }}</dt>
            <dd>
              {{
                t(
                  'feedback.diagnosticsAttached',
                  { count: state.previewPayload.diagnostics.eventCount },
                  state.previewPayload.diagnostics.eventCount,
                )
              }}
              <UiDisclosure
                v-if="diagnosticsSummary.length"
                class="feedback-report__events"
                :label="t('feedback.viewDetails')"
              >
                <ol class="feedback-report__event-list">
                  <li v-for="row in diagnosticsSummary" :key="row.key">
                    <span class="feedback-report__event-meta">{{
                      t('feedback.eventMeta', {
                        time: row.time,
                        level: row.level,
                      })
                    }}</span>
                    {{ row.message }}
                  </li>
                </ol>
              </UiDisclosure>
            </dd>
          </div>
        </dl>

        <UiNotice v-if="state.notice" :notice="visibleNotice" compact />
        <div class="feedback-report__fallback">
          <p class="feedback-report__intro">
            {{ t('feedback.fallbackIntro') }}
          </p>
        </div>
      </template>

      <template v-else-if="state.step === 'result'">
        <p ref="resultMessage" class="feedback-report__intro" tabindex="-1">
          {{ t('feedback.sent') }}
        </p>
        <p v-if="reportReference" class="feedback-report__report-id">
          {{ t('feedback.reportCode', { reference: reportReference }) }}
        </p>
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
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.feedback-report__summary {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.feedback-report__summary:focus-visible,
.feedback-report__intro[tabindex]:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.feedback-report__row {
  display: grid;
  gap: var(--ui-space-1);
}

.feedback-report__row dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.feedback-report__row dd {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  overflow-wrap: anywhere;
}

.feedback-report__description {
  white-space: pre-wrap;
}

.feedback-report__events {
  margin-top: var(--ui-space-2);
}

.feedback-report__event-list {
  display: grid;
  gap: var(--ui-space-1);
  max-height: 12rem;
  margin: 0;
  padding-left: var(--ui-space-4);
  overflow-y: auto;
  font-size: var(--ui-type-caption-size);
  overflow-wrap: anywhere;
}

.feedback-report__event-meta {
  color: var(--ui-color-text-muted);
}

.feedback-report__report-id {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  -webkit-user-select: text;
  user-select: text;
}

.feedback-report__fallback {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2) var(--ui-space-3);
}

.feedback-report__fallback .feedback-report__intro {
  flex: 1 1 16rem;
}
</style>
