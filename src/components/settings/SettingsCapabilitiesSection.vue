<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  watch,
} from 'vue';
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
import AppFolderSection from '../layout/AppFolderSection.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import FfmpegSourceModal from './FfmpegSourceModal.vue';
import MusicAnalysisSettingsRow from './MusicAnalysisSettingsRow.vue';
import ObsIntegrationSettingsBlock from './ObsIntegrationSettingsBlock.vue';
import ObsSessionExportModal from './ObsSessionExportModal.vue';
import OutputRuntimeSettingsBlock from './OutputRuntimeSettingsBlock.vue';
import SeparationGpuSettingsRow from './SeparationGpuSettingsRow.vue';
import SettingsFeatureGateRow from './SettingsFeatureGateRow.vue';

const OPTIONAL_FEATURE_GROUPS = Object.freeze([
  {
    id: 'sources',
    title: '來源與內容',
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
    await revealSettingsTarget(`settings-group-${section}`);
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

function handleFeatureDependencyNoticeAction() {
  const notice = featureDependencyState.error;
  if (!notice) return;
  if (notice.operation === 'prepare' && notice.context?.dependencyId) {
    prepareDependency(notice.context.dependencyId);
    return;
  }
  refreshDependencies();
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
  detectSystemFfmpeg();
  refreshConfirmations();
  refreshDependencies();
  musicAnalysisSettings.initialize();
  separationSettings.refreshPreference();
  obsIntegrationSettings.refreshSettings();
});

onUnmounted(() => {
  musicAnalysisSettings.dispose();
});
</script>

<template>
  <AppFolderSection
    id="settings-optional"
    class="settings-capabilities-section"
    title="選用功能"
    tabindex="-1"
  >
    <template #actions>
      <UiIconButton
        :icon="RefreshCw"
        :disabled="featureGateState.isLoading"
        label="重新讀取功能狀態"
        @click="refreshConfirmations"
      />
    </template>

    <UiNotice
      v-if="featureGateRequestNotice"
      tone="warning"
      :title="featureGateRequestNotice.title"
      :message="featureGateRequestNotice.message"
      :action-label="featureGateRequestNotice.actionLabel"
      compact
      @action="handleFeatureGateRequestAction"
    />

    <div class="settings-capabilities-section__groups">
      <AppFolderSection
        v-for="group in optionalFeatureGroups"
        :id="`settings-group-${group.id}`"
        :key="group.id"
        class="settings-capabilities-section__group"
        :title="group.title"
        :heading-level="3"
        tabindex="-1"
      >
        <SettingsFeatureGateRow
          v-for="gate in group.gates"
          :id="`settings-feature-${gate.id}`"
          :key="gate.id"
          tabindex="-1"
          :gate="gate"
          :items="gate.items"
          :highlighted="
            featureGateAccessState.request?.featureId === gate.id &&
            (featureGateAccessState.request?.kind === 'setup' || !gate.enabled)
          "
          :action-label="gateActionLabel(gate)"
          :disable-enable-action="isGateActionDisabled(gate)"
          @enable="enableFeature"
          @item-action="handleWorkflowItemAction"
          @item-advanced-action="handleWorkflowItemAdvancedAction"
        >
          <template #items>
            <MusicAnalysisSettingsRow
              v-if="
                gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW && gate.enabled
              "
              :capability="musicAnalysisSettings.capability.value"
              :auto-analyze="musicAnalysisSettings.autoAnalyze.value"
              :capability-busy="musicAnalysisSettings.capabilityBusy.value"
              :preference-busy="musicAnalysisSettings.preferenceBusy.value"
              :stage-label="musicAnalysisSettings.stageLabel.value"
              :capability-error="musicAnalysisSettings.capabilityError.value"
              :preference-error="musicAnalysisSettings.preferenceError.value"
              @set-auto-analyze="musicAnalysisSettings.setAutoAnalyze"
              @prepare="musicAnalysisSettings.prepare"
              @repair="musicAnalysisSettings.repair"
              @remove="handleRemoveMusicAnalysis"
            />
            <SeparationGpuSettingsRow
              v-if="
                gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW && gate.enabled
              "
              :gpu-acceleration="separationSettings.gpuAcceleration.value"
              :preference-busy="separationSettings.preferenceBusy.value"
              :preference-error="separationSettings.preferenceError.value"
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
              :error="obsIntegrationSettings.error.value"
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
        </SettingsFeatureGateRow>
      </AppFolderSection>
    </div>

    <UiNotice
      v-if="featureGateState.error"
      tone="danger"
      title="功能啟用失敗"
      :message="featureGateState.error"
      compact
    />

    <UiNotice
      v-if="featureDependencyState.error"
      :notice="featureDependencyState.error"
      compact
      @action="handleFeatureDependencyNoticeAction"
    />

    <ObsSessionExportModal />

    <FfmpegSourceModal
      :open="isFfmpegSourceModalOpen"
      :initial-detection="systemFfmpegDetection"
      @close="isFfmpegSourceModalOpen = false"
    />
  </AppFolderSection>
</template>

<style scoped>
.settings-capabilities-section,
.settings-capabilities-section__groups,
.settings-capabilities-section__group {
  min-inline-size: 0;
  display: grid;
  align-content: start;
}

.settings-capabilities-section,
.settings-capabilities-section__group {
  scroll-margin-block-start: var(--ui-space-4);
}

.settings-capabilities-section:focus,
.settings-capabilities-section__group:focus {
  outline: none;
}

.settings-capabilities-section__groups {
  gap: var(--ui-space-6);
}

.settings-capabilities-section__group {
  gap: var(--ui-space-3);
}

@container app-folder-layout (max-width: 56.25rem) {
  .settings-capabilities-section__groups {
    gap: var(--ui-space-5);
  }
}
</style>
