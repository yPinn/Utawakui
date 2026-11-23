<script setup>
import { computed, shallowRef, useId } from 'vue';
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
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiModal from '../ui/UiModal.vue';
import AutoErrorReportingSettingsRow from './AutoErrorReportingSettingsRow.vue';
import DiagnosticsSettingsRow from './DiagnosticsSettingsRow.vue';
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
const supportOpen = shallowRef(false);
const internalTools = import.meta.env.DEV;
const capture = computed(() => {
  const notice = captureErrorNotice.value;
  switch (notice?.code) {
    case 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE':
      return {
        status: t('settings.troubleshooting.audioDeviceUnavailable'),
        guidance: t('settings.troubleshooting.audioDeviceGuidance'),
      };
    case 'AUDIO_OUTPUT_PROCESSING_FAILED':
      return {
        status: t('settings.troubleshooting.audioInterrupted'),
        guidance: t('settings.troubleshooting.audioGuidance'),
      };
    default:
      return {
        status: notice?.title,
        guidance: notice?.message || t('settings.troubleshooting.audioHelp'),
      };
  }
});
const obsNeedsAttention = computed(
  () =>
    obs.state.desired.enabled &&
    ['error', 'degraded'].includes(obs.state.observed.lifecycle),
);
const obsWaiting = computed(
  () =>
    obsNeedsAttention.value &&
    obs.state.error?.code === 'OBS_CONNECTION_REFUSED',
);
const obsStatus = computed(() => {
  if (obs.state.statusReadError)
    return t('settings.troubleshooting.unavailable');
  if (!obs.state.statusLoaded) return t('settings.reading');
  if (obsWaiting.value) return t('settings.troubleshooting.obsWaiting');
  return t(`obs.lifecycle.${obs.state.observed.lifecycle}`);
});
const obsGuidance = computed(() => {
  if (obs.state.statusReadError) return obs.state.statusReadError;
  if (!obs.state.statusLoaded || !obsNeedsAttention.value) {
    return t('settings.troubleshooting.obsHelp');
  }
  if (obsWaiting.value) return t('settings.troubleshooting.obsWaitingGuidance');
  if (obs.state.error?.code === 'OBS_AUTH_FAILED') {
    return t('settings.troubleshooting.obsAuthGuidance');
  }
  return obs.state.error?.message || t('settings.troubleshooting.obsGuidance');
});

function setSupportOpen(open) {
  if (!props.open || open === supportOpen.value) return;
  supportOpen.value = open;
  if (!open) return;
  void autoErrorReporting.refreshPreference();
  if (internalTools) void diagnostics.refresh();
}

let afterClose;
function closeThen(action) {
  afterClose = action;
  emit('close');
}

function onAfterLeave() {
  supportOpen.value = false;
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
          :title="t('settings.troubleshooting.library')"
          :guidance="t('settings.troubleshooting.libraryGuidance')"
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
        <SettingsDocumentItem
          variant="nested"
          :title="t('settings.troubleshooting.audioSection')"
          :value="capture.status"
          :guidance="capture.guidance"
        >
          <template #actions>
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
          :title="t('settings.troubleshooting.obsSection')"
          :value="obsStatus"
          :guidance="obsGuidance"
        >
          <template #actions>
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
      </section>
      <UiDisclosure
        class="troubleshooting-modal__more"
        :label="t('settings.troubleshooting.moreSupport')"
        :open="supportOpen"
        @update:open="setSupportOpen"
      >
        <div v-if="supportOpen" class="troubleshooting-modal__support">
          <SettingsDocumentItem
            variant="nested"
            :title="t('settings.troubleshooting.supportPackage')"
            :guidance="t('settings.troubleshooting.supportPackageGuidance')"
          >
            <template #actions>
              <UiButton
                variant="secondary"
                :loading="diagnostics.state.isLoading"
                @click="diagnostics.exportBundle"
              >
                {{ t('settings.troubleshooting.export') }}
              </UiButton>
            </template>
          </SettingsDocumentItem>
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
      </UiDisclosure>
    </div>
    <template #footer>
      <UiButton
        variant="accent"
        aria-haspopup="dialog"
        @click="closeThen(openReport)"
      >
        {{ t('feedback.title') }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.troubleshooting-modal {
  --settings-copy-inset: 0px;
  container: settings-section / inline-size;
  display: grid;
  gap: var(--ui-space-4);
}

.troubleshooting-modal__group > * + * + *,
.troubleshooting-modal__support > * + * {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.troubleshooting-modal__heading {
  margin: 0;
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.troubleshooting-modal__more :deep(.ui-disclosure__body) {
  padding-inline: 0;
  padding-block-start: 0;
}
</style>
