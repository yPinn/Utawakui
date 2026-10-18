<script setup>
import { computed, nextTick, onMounted, shallowRef, watch } from 'vue';
import { RefreshCw } from '../../icons/index.js';
import {
  FEATURE_DEPENDENCY_IDS,
  getFeatureDependencies,
  isKnownFeatureDependency,
} from '../../constants/featureDependencies.js';
import { FEATURE_IDS } from '../../constants/featureGates.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppView } from '../../composables/useAppView.js';
import { useFeatureDependencies } from '../../composables/useFeatureDependencies.js';
import { useFeatureGateAccess } from '../../composables/useFeatureGateAccess.js';
import { useFeatureGatePresentation } from '../../composables/useFeatureGatePresentation.js';
import { useFeatureGates } from '../../composables/useFeatureGates.js';
import { useMusicAnalysisSettings } from '../../composables/useMusicAnalysisSettings.js';
import { useObsIntegrationSettings } from '../../composables/useObsIntegrationSettings.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { useSeparationSettings } from '../../composables/useSeparationSettings.js';
import { useOnFirstVisible } from '../../composables/useOnFirstVisible.js';
import SettingsSection from './SettingsSection.vue';
import MusicAnalysisPreferenceRow from './MusicAnalysisPreferenceRow.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import FfmpegSourceModal from './FfmpegSourceModal.vue';
import MusicAnalysisSettingsRow from './MusicAnalysisSettingsRow.vue';
import ObsIntegrationSettingsBlock from './ObsIntegrationSettingsBlock.vue';
import OutputRuntimeSettingsBlock from './OutputRuntimeSettingsBlock.vue';
import SeparationGpuSettingsRow from './SeparationGpuSettingsRow.vue';
import SettingsFeatureGateRow from './SettingsFeatureGateRow.vue';

const OPTIONAL_FEATURE_GROUPS = Object.freeze([
  {
    id: 'sources',
    title: '外部來源與歌詞',
    featureIds: [FEATURE_IDS.PROVIDER_FLOW, FEATURE_IDS.LYRICS_FLOW],
  },
  {
    id: 'processing',
    title: '本機音訊處理',
    featureIds: [FEATURE_IDS.AUDIO_PROCESSING_FLOW],
  },
  {
    id: 'output',
    title: '公開輸出與 OBS',
    featureIds: [FEATURE_IDS.PUBLIC_OUTPUT_FLOW, FEATURE_IDS.OBS_INTEGRATION],
  },
]);

const SETTINGS_FEATURES = new Set([
  FEATURE_IDS.AUDIO_PROCESSING_FLOW,
  FEATURE_IDS.PUBLIC_OUTPUT_FLOW,
  FEATURE_IDS.OBS_INTEGRATION,
]);
const musicToolNeedsAttention = computed(() =>
  Boolean(
    musicAnalysisSettings.capabilityError.value ||
    musicAnalysisSettings.capabilityReadError.value ||
    (musicAnalysisSettings.capability.value &&
      !musicAnalysisSettings.capabilityBusy.value &&
      musicAnalysisSettings.capability.value.status !== 'ready'),
  ),
);

const {
  state: featureGateState,
  isFeatureEnabled,
  refreshConfirmations,
} = useFeatureGates();
const { state: featureGateAccessState, clearFeatureGateRequest } =
  useFeatureGateAccess();
const {
  state: featureDependencyState,
  refreshDependencies,
  prepareDependency,
  removeDependency,
  repairDependency,
} = useFeatureDependencies();
const musicAnalysisSettings = useMusicAnalysisSettings();
const separationSettings = useSeparationSettings();
const obsIntegrationSettings = useObsIntegrationSettings();
const obsSessionExport = useObsSessionExport();
const { confirm: confirmAction } = useAppConfirmation();
const systemFfmpegDetection = shallowRef(null);
const isFfmpegSourceModalOpen = shallowRef(false);
const optionalGroups = shallowRef(null);
useOnFirstVisible(optionalGroups, detectSystemFfmpeg);

const {
  featureGateRows,
  enableFeature,
  gateActionLabel,
  isGateActionDisabled,
  DEPENDENCY_ADVANCED_ACTIONS,
} = useFeatureGatePresentation({ systemFfmpegDetection });

const optionalFeatureGroups = computed(() => {
  const rowsById = new Map(
    featureGateRows.value.map((feature) => [feature.id, feature]),
  );

  return OPTIONAL_FEATURE_GROUPS.map((group) => ({
    ...group,
    gates: group.featureIds
      .map((featureId) => rowsById.get(featureId))
      .filter(Boolean),
  }));
});

const { settingsSection, clearSettingsSection } = useAppView();

async function revealSettingsTarget(targetId) {
  await nextTick();
  const target = document.getElementById(targetId);
  target?.scrollIntoView({ block: 'start' });
  target?.focus({ preventScroll: true });
}

watch(
  settingsSection,
  async (section) => {
    if (!section) return;
    clearSettingsSection();
    await revealSettingsTarget(
      section === 'application'
        ? 'settings-application'
        : `settings-group-${section}`,
    );
  },
  { immediate: true },
);

watch(
  () => featureGateAccessState.request?.featureId,
  async (featureId) => {
    if (featureId) {
      await revealSettingsTarget(`settings-feature-${featureId}`);
    }
  },
  { immediate: true },
);

function isDependencyInstalled(dependencyId) {
  return Boolean(featureDependencyState.byId[dependencyId]?.installed);
}

function isSetupRequestResolved(request = featureGateAccessState.request) {
  if (request?.kind !== 'setup') return false;
  const dependencyId = request.context?.dependencyId;
  if (dependencyId) return isDependencyInstalled(dependencyId);

  const dependencies = getFeatureDependencies(request.featureId);
  return (
    dependencies.length > 0 &&
    dependencies.every((dependency) => isDependencyInstalled(dependency.id))
  );
}

function clearResolvedSetupRequest() {
  const request = featureGateAccessState.request;
  if (isSetupRequestResolved(request)) {
    clearFeatureGateRequest(request.featureId);
  }
}

const featureGateRequestNotice = computed(() => {
  const request = featureGateAccessState.request;
  if (
    !request ||
    (request.kind !== 'setup' && isFeatureEnabled(request.featureId))
  ) {
    return null;
  }
  return {
    title: request.title,
    message: request.message,
    actionLabel: request.actionLabel,
    kind: request.kind,
  };
});

async function detectSystemFfmpeg() {
  if (
    typeof window === 'undefined' ||
    typeof window.Utawakui?.detectSystemFfmpeg !== 'function'
  ) {
    return;
  }
  try {
    systemFfmpegDetection.value = await window.Utawakui.detectSystemFfmpeg();
  } catch {
    // Best-effort hint only. Failed detection keeps the existing unknown state.
  }
}

async function handleRemoveMusicAnalysis() {
  const confirmed = await confirmAction({
    title: '移除 BPM 分析元件？',
    message: 'BPM 分析元件會被移除。',
    detail: '歌曲與既有分析資料都會保留，之後可以重新準備。',
    confirmLabel: '移除元件',
    intent: 'danger',
  });
  if (!confirmed) return;

  await musicAnalysisSettings.remove();
}

async function handleClearObsPassword() {
  const confirmed = await confirmAction({
    title: '移除 OBS 密碼？',
    message: '已儲存的 OBS 密碼會被移除。',
    detail: '下次連線時需要重新輸入密碼。',
    confirmLabel: '移除密碼',
    intent: 'danger',
  });
  if (confirmed) await obsIntegrationSettings.clearPassword();
}

async function refreshDependencyStatus() {
  await refreshDependencies();
  clearResolvedSetupRequest();
}

async function handleWorkflowItemAction(itemId) {
  if (itemId === FEATURE_DEPENDENCY_IDS.FFMPEG_GYAN_ESSENTIALS) {
    isFfmpegSourceModalOpen.value = true;
    return;
  }
  if (
    itemId === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL &&
    featureDependencyState.byId[itemId]?.installed
  ) {
    await repairDependency(itemId);
    await refreshDependencyStatus();
    return;
  }
  if (isKnownFeatureDependency(itemId)) {
    await prepareDependency(itemId);
    clearResolvedSetupRequest();
  }
}

async function handleWorkflowItemAdvancedAction({ item, action }) {
  if (!isKnownFeatureDependency(item.id)) return;

  if (action === DEPENDENCY_ADVANCED_ACTIONS.REFRESH) {
    await refreshDependencyStatus();
    return;
  }

  if (action === DEPENDENCY_ADVANCED_ACTIONS.REPAIR) {
    await repairDependency(item.id);
    await refreshDependencyStatus();
    clearResolvedSetupRequest();
    return;
  }

  if (action === DEPENDENCY_ADVANCED_ACTIONS.REMOVE) {
    const itemTitle = item.title || item.name;
    const confirmed = await confirmAction({
      title: `移除「${itemTitle}」？`,
      message: '移除後，此功能會暫時無法使用。',
      detail: '需要時可以重新準備。',
      confirmLabel: '移除元件',
      intent: 'danger',
    });
    if (!confirmed) return;
    await removeDependency(item.id);
    await refreshDependencyStatus();
  }
}

function handleFeatureDependencyNoticeAction(notice) {
  const id = notice?.context?.dependencyId;
  if (notice?.operation === 'prepare' && id) return prepareDependency(id);
  if (notice?.operation === 'repair' && id) return repairDependency(id);
  return refreshDependencies();
}

function handleFeatureGateRequestAction() {
  const request = featureGateAccessState.request;
  if (!request) return;
  if (request.kind === 'setup') {
    refreshDependencies().then(clearResolvedSetupRequest);
    return;
  }
  enableFeature(request.featureId);
}

onMounted(() => {
  refreshConfirmations();
  refreshDependencies();
  musicAnalysisSettings.initialize();
  separationSettings.refreshPreference();
  obsIntegrationSettings.refreshSettings();
});
</script>

<template>
  <div id="settings-optional" class="settings-capabilities-section">
    <UiNotice
      v-if="featureGateState.readError"
      tone="danger"
      title="功能狀態無法讀取"
      :message="featureGateState.readError"
      action-label="重新讀取"
      compact
      @action="refreshConfirmations"
    />
    <UiNotice
      v-if="featureDependencyState.readError"
      :notice="featureDependencyState.readError"
      compact
      @action="refreshDependencies"
    />

    <div ref="optionalGroups" class="settings-capabilities-section__groups">
      <SettingsSection
        v-for="group in optionalFeatureGroups"
        :id="`settings-group-${group.id}`"
        :key="group.id"
        class="settings-capabilities-section__group"
        :title="group.title"
        tabindex="-1"
      >
        <template v-if="group.id === 'sources'" #actions>
          <UiIconButton
            :icon="RefreshCw"
            :disabled="featureGateState.isLoading"
            label="重新讀取功能狀態"
            @click="refreshConfirmations"
          />
        </template>

        <SettingsFeatureGateRow
          v-for="gate in group.gates"
          :id="`settings-feature-${gate.id}`"
          :key="gate.id"
          tabindex="-1"
          :gate="gate"
          :request-notice="
            featureGateAccessState.request?.featureId === gate.id
              ? featureGateRequestNotice
              : null
          "
          :items="gate.items"
          :has-settings="SETTINGS_FEATURES.has(gate.id)"
          :retain-settings="
            gate.id === FEATURE_IDS.OBS_INTEGRATION &&
            obsIntegrationSettings.hasStoredPassword.value
          "
          :additional-tool-count="
            gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW ? 1 : 0
          "
          :additional-tool-loaded="
            gate.id !== FEATURE_IDS.AUDIO_PROCESSING_FLOW ||
            Boolean(
              musicAnalysisSettings.capability.value ||
              musicAnalysisSettings.capabilityReadError.value,
            )
          "
          :additional-tool-busy="
            gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW &&
            musicAnalysisSettings.capabilityBusy.value
          "
          :additional-tool-attention="
            gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW &&
            musicToolNeedsAttention
          "
          :highlighted="
            featureGateAccessState.request?.featureId === gate.id &&
            (featureGateAccessState.request?.kind === 'setup' || !gate.enabled)
          "
          :action-label="gateActionLabel(gate)"
          :disable-enable-action="isGateActionDisabled(gate)"
          @request-action="handleFeatureGateRequestAction"
          @notice-action="handleFeatureDependencyNoticeAction"
          @enable="enableFeature"
          @item-action="handleWorkflowItemAction"
          @item-advanced-action="handleWorkflowItemAdvancedAction"
        >
          <template #settings>
            <MusicAnalysisPreferenceRow
              v-if="
                gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW && gate.enabled
              "
              :auto-analyze="musicAnalysisSettings.autoAnalyze.value"
              :busy="musicAnalysisSettings.preferenceBusy.value"
              :reading="musicAnalysisSettings.preferenceReading.value"
              :loaded="musicAnalysisSettings.preferenceLoaded.value"
              :error="musicAnalysisSettings.preferenceSaveError.value"
              :read-error="musicAnalysisSettings.preferenceReadError.value"
              @refresh-preference="musicAnalysisSettings.refreshPreference"
              @set-auto-analyze="musicAnalysisSettings.setAutoAnalyze"
            />
            <SeparationGpuSettingsRow
              v-if="
                gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW && gate.enabled
              "
              :gpu-acceleration="separationSettings.gpuAcceleration.value"
              :preference-busy="separationSettings.preferenceBusy.value"
              :preference-error="separationSettings.preferenceSaveError.value"
              :read-error="separationSettings.preferenceReadError.value"
              :reading="separationSettings.preferenceReading.value"
              :loaded="separationSettings.preferenceLoaded.value"
              @refresh-preference="separationSettings.refreshPreference"
              @set-gpu-acceleration="separationSettings.setGpuAcceleration"
            />
            <OutputRuntimeSettingsBlock
              v-if="gate.id === FEATURE_IDS.PUBLIC_OUTPUT_FLOW && gate.enabled"
            />
            <ObsIntegrationSettingsBlock
              v-if="
                gate.id === FEATURE_IDS.OBS_INTEGRATION &&
                (gate.enabled || obsIntegrationSettings.hasStoredPassword.value)
              "
              :status="obsIntegrationSettings.status"
              :feature-enabled="gate.enabled"
              :host="obsIntegrationSettings.host.value"
              :port="obsIntegrationSettings.port.value"
              :password="obsIntegrationSettings.password.value"
              :skip-threshold-seconds="
                obsIntegrationSettings.skipThresholdSeconds.value
              "
              :has-stored-password="
                obsIntegrationSettings.hasStoredPassword.value
              "
              :is-saving="obsIntegrationSettings.isSaving.value"
              :field-errors="obsIntegrationSettings.fieldErrors.value"
              :validation-attempt="
                obsIntegrationSettings.validationAttempt.value
              "
              :read-error="obsIntegrationSettings.readError.value"
              :save-error="obsIntegrationSettings.saveError.value"
              :password-error="obsIntegrationSettings.passwordError.value"
              :connection-error="obsIntegrationSettings.connectionError.value"
              :is-loading="obsIntegrationSettings.isLoading.value"
              @refresh-settings="obsIntegrationSettings.refreshSettings"
              @refresh-status="obsIntegrationSettings.refreshStatus"
              @update:host="obsIntegrationSettings.host.value = $event"
              @update:port="obsIntegrationSettings.port.value = $event"
              @update:password="obsIntegrationSettings.password.value = $event"
              @update:skip-threshold-seconds="
                obsIntegrationSettings.skipThresholdSeconds.value = $event
              "
              @save="obsIntegrationSettings.save"
              @clear-password="handleClearObsPassword"
              @retry-connect="obsIntegrationSettings.retryConnect"
              @export-chapters="obsSessionExport.open()"
            />
          </template>
          <template #tools>
            <MusicAnalysisSettingsRow
              v-if="
                gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW && gate.enabled
              "
              :capability="musicAnalysisSettings.capability.value"
              :capability-busy="musicAnalysisSettings.capabilityBusy.value"
              :stage-label="musicAnalysisSettings.stageLabel.value"
              :progress-percent="musicAnalysisSettings.progressPercent.value"
              :capability-error="musicAnalysisSettings.capabilityError.value"
              :capability-read-error="
                musicAnalysisSettings.capabilityReadError.value
              "
              @refresh-capability="musicAnalysisSettings.refreshCapability"
              @prepare="musicAnalysisSettings.prepare"
              @repair="musicAnalysisSettings.repair"
              @remove="handleRemoveMusicAnalysis"
            />
          </template>
        </SettingsFeatureGateRow>
      </SettingsSection>
    </div>

    <FfmpegSourceModal
      :open="isFfmpegSourceModalOpen"
      :initial-detection="systemFfmpegDetection"
      @close="isFfmpegSourceModalOpen = false"
    />
  </div>
</template>

<style scoped>
.settings-capabilities-section,
.settings-capabilities-section__groups {
  min-inline-size: 0;
  display: grid;
  gap: var(--settings-section-gap, var(--ui-space-6));
}
</style>
