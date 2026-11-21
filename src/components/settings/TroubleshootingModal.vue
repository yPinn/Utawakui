<script setup>
import { computed, useId, watch } from 'vue';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppView } from '../../composables/useAppView.js';
import { useAudioOutput } from '../../composables/useAudioOutput.js';
import { useAutoErrorReportingSetting } from '../../composables/useAutoErrorReport.js';
import { useFeedbackReport } from '../../composables/useFeedbackReport.js';
import { useLibraryReconciliation } from '../../composables/useLibraryReconciliation.js';
import { useObsIntegration } from '../../composables/useObsIntegration.js';
import { usePersistentDiagnostics } from '../../composables/usePersistentDiagnostics.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import AutoErrorReportingSettingsRow from './AutoErrorReportingSettingsRow.vue';
import DiagnosticsSettingsRow from './DiagnosticsSettingsRow.vue';
import FeedbackReportSettingsRow from './FeedbackReportSettingsRow.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['close']);
const { openSettings } = useAppView();
const { confirm } = useAppConfirmation();
const { captureErrorNotice } = useAudioOutput();
const obs = useObsIntegration();
const reconciliation = useLibraryReconciliation();
const diagnostics = usePersistentDiagnostics();
const autoErrorReporting = useAutoErrorReportingSetting();
const { openReport } = useFeedbackReport();
const checksHeading = useId();
const reportingHeading = useId();
const internalTools = import.meta.env.DEV;
const captureDeviceUnavailable = computed(
  () => captureErrorNotice?.value?.code === 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE',
);
const captureInterrupted = computed(
  () => captureErrorNotice?.value?.code === 'AUDIO_OUTPUT_PROCESSING_FAILED',
);
const captureNeedsAttention = computed(
  () => captureDeviceUnavailable.value || captureInterrupted.value,
);
const captureStatus = computed(() => {
  if (captureDeviceUnavailable.value)
    return t('settings.troubleshooting.audioDeviceUnavailable');
  if (captureInterrupted.value)
    return t('settings.troubleshooting.audioInterrupted');
  return t('settings.troubleshooting.noIssue');
});
const obsUnavailable = computed(
  () => obs.state.desired.enabled && obs.state.observed.lifecycle === 'error',
);
const obsWaiting = computed(
  () =>
    obsUnavailable.value && obs.state.error?.code === 'OBS_CONNECTION_REFUSED',
);
const obsStatus = computed(() => {
  if (obs.state.statusReadError)
    return t('settings.troubleshooting.unavailable');
  if (!obs.state.statusLoaded) return t('settings.reading');
  if (obsWaiting.value) return t('settings.troubleshooting.obsWaiting');
  if (obsUnavailable.value) return t('settings.troubleshooting.obs');
  return t(`obs.lifecycle.${obs.state.observed.lifecycle}`);
});
const obsGuidance = computed(() => {
  if (!obsUnavailable.value || obs.state.statusReadError) return '';
  if (obsWaiting.value) return t('settings.troubleshooting.obsWaitingGuidance');
  return obs.state.error?.message || t('settings.troubleshooting.obsGuidance');
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    void autoErrorReporting.refreshPreference();
    if (internalTools) void diagnostics.refresh();
  },
  { immediate: true },
);

let afterClose;
function closeThen(action) {
  afterClose = action;
  emit('close');
}

function onAfterLeave() {
  const action = afterClose;
  afterClose = undefined;
  action?.();
}

async function clearDiagnostics() {
  const confirmed = await confirm({
    title: t('settings.support.clearTitle'),
    message: t('settings.support.clearMessage'),
    detail: t('settings.support.clearDetail'),
    confirmLabel: t('settings.support.clearConfirm'),
    intent: 'danger',
  });
  if (confirmed) await diagnostics.clear();
}
</script>

<template>
  <UiModal
    :open="open"
    :title="t('settings.troubleshooting.title')"
    size="wide"
    initial-focus="dialog"
    @close="emit('close')"
    @after-leave="onAfterLeave"
  >
    <div class="troubleshooting-modal">
      <section
        class="troubleshooting-modal__group"
        :aria-labelledby="checksHeading"
      >
        <h3 :id="checksHeading" class="troubleshooting-modal__heading">
          {{ t('settings.troubleshooting.checksSection') }}
        </h3>
        <SettingsDocumentItem
          variant="nested"
          title-tag="h4"
          :title="t('settings.troubleshooting.audioSection')"
          :value="captureStatus"
          :guidance="
            captureDeviceUnavailable
              ? t('settings.troubleshooting.audioDeviceGuidance')
              : captureInterrupted
                ? t('settings.troubleshooting.audioGuidance')
                : ''
          "
        >
          <template v-if="captureNeedsAttention" #actions>
            <UiButton
              variant="secondary"
              @click="closeThen(() => openSettings('capture-output'))"
            >
              {{ t('settings.troubleshooting.openAudio') }}
            </UiButton>
          </template>
        </SettingsDocumentItem>
        <SettingsDocumentItem
          variant="nested"
          title-tag="h4"
          :title="t('settings.troubleshooting.obsSection')"
          :value="obsStatus"
          :guidance="obsGuidance"
        >
          <template v-if="obsUnavailable || obs.state.statusReadError" #actions>
            <UiButton
              v-if="obs.state.statusReadError"
              variant="secondary"
              @click="obs.refreshObsStatus"
            >
              {{ t('settings.reload') }}
            </UiButton>
            <UiButton
              v-else
              variant="secondary"
              @click="closeThen(() => openSettings('obs-connection'))"
            >
              {{ t('settings.troubleshooting.openObs') }}
            </UiButton>
          </template>
        </SettingsDocumentItem>
        <SettingsDocumentItem
          variant="nested"
          title-tag="h4"
          :title="t('settings.troubleshooting.library')"
        >
          <template #actions>
            <UiButton
              variant="secondary"
              :disabled="reconciliation.state.busy"
              @click="closeThen(reconciliation.open)"
            >
              {{ t('settings.troubleshooting.checkLibrary') }}
            </UiButton>
          </template>
        </SettingsDocumentItem>
      </section>
      <section
        class="troubleshooting-modal__group"
        :aria-labelledby="reportingHeading"
      >
        <h3 :id="reportingHeading" class="troubleshooting-modal__heading">
          {{ t('settings.troubleshooting.reportingSection') }}
        </h3>
        <FeedbackReportSettingsRow @open="closeThen(openReport)" />
        <AutoErrorReportingSettingsRow
          :reporting="autoErrorReporting.reporting.value"
          :busy="autoErrorReporting.preferenceBusy.value"
          :reading="autoErrorReporting.preferenceReading.value"
          :loaded="autoErrorReporting.preferenceLoaded.value"
          :error="autoErrorReporting.preferenceSaveError.value"
          :read-error="autoErrorReporting.preferenceReadError.value"
          @refresh-preference="autoErrorReporting.refreshPreference"
          @set-reporting="autoErrorReporting.setReporting"
        />
      </section>
      <DiagnosticsSettingsRow
        v-if="internalTools"
        :show-export="false"
        :record-count="diagnostics.state.recordCount"
        :is-loading="diagnostics.state.isLoading"
        :notice="diagnostics.state.notice"
        @refresh="diagnostics.refresh"
        @open-folder="diagnostics.openFolder"
        @clear="clearDiagnostics"
        @notice-action="diagnostics.refresh"
      />
    </div>
    <template #footer>
      <UiButton
        variant="secondary"
        :loading="diagnostics.state.isLoading"
        @click="diagnostics.exportBundle"
      >
        {{ t('settings.troubleshooting.export') }}
      </UiButton>
      <UiButton @click="emit('close')">{{ t('common.close') }}</UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.troubleshooting-modal {
  --settings-copy-inset: 0px;
  display: grid;
  gap: var(--ui-space-4);
}

.troubleshooting-modal__group > * + * + * {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.troubleshooting-modal__heading {
  margin: 0;
  font-size: var(--ui-type-subtitle-size);
  line-height: var(--ui-type-subtitle-line-height);
}
</style>
