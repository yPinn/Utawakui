<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  watch,
} from 'vue';
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
import { useObsIntegrationSettings } from '../../composables/useObsIntegrationSettings.js';
import { useSeparationSettings } from '../../composables/useSeparationSettings.js';
import { useYoutubeLoginSettings } from '../../composables/useYoutubeLoginSettings.js';
import { useOnFirstVisible } from '../../composables/useOnFirstVisible.js';
import SettingsSection from './SettingsSection.vue';
import YoutubeLoginRow from './YoutubeLoginRow.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiNotice from '../ui/UiNotice.vue';
import FfmpegSourceModal from './FfmpegSourceModal.vue';
import ObsIntegrationSettingsBlock from './ObsIntegrationSettingsBlock.vue';
import CompanionSettingsBlock from './CompanionSettingsBlock.vue';
import OutputRuntimeSettingsBlock from './OutputRuntimeSettingsBlock.vue';
import SeparationGpuSettingsRow from './SeparationGpuSettingsRow.vue';
import SeparationAutoSettingsRow from './SeparationAutoSettingsRow.vue';
import SettingsFeatureGateRow from './SettingsFeatureGateRow.vue';
import SettingsDependencyRows from './SettingsDependencyRows.vue';
import { t } from '../../utils/i18n.js';

const OPTIONAL_FEATURE_GROUPS = Object.freeze([
  {
    id: 'sources',
    title: t('capabilities.groups.sources'),
    featureIds: [FEATURE_IDS.PROVIDER_FLOW, FEATURE_IDS.LYRICS_FLOW],
  },
  {
    id: 'processing',
    title: t('capabilities.groups.processing'),
    featureIds: [FEATURE_IDS.AUDIO_PROCESSING_FLOW],
  },
  {
    id: 'output',
    title: t('capabilities.groups.output'),
    featureIds: [FEATURE_IDS.PUBLIC_OUTPUT_FLOW, FEATURE_IDS.OBS_INTEGRATION],
  },
  {
    id: 'remote',
    title: t('capabilities.groups.remote'),
    featureIds: [FEATURE_IDS.MOBILE_COMPANION],
  },
]);

// Gates whose #settings slot holds rows; a slot outside this set never shows.
const SETTINGS_FEATURES = new Set([
  FEATURE_IDS.PROVIDER_FLOW,
  FEATURE_IDS.PUBLIC_OUTPUT_FLOW,
  FEATURE_IDS.OBS_INTEGRATION,
  FEATURE_IDS.MOBILE_COMPANION,
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
const separationSettings = useSeparationSettings();
const youtubeLoginSettings = useYoutubeLoginSettings();
const youtubeLogin = computed(() => ({
  source: youtubeLoginSettings.source.value,
  loaded: youtubeLoginSettings.loaded.value,
  reading: youtubeLoginSettings.reading.value,
  busy: youtubeLoginSettings.busy.value,
  readError: youtubeLoginSettings.readError.value,
  saveError: youtubeLoginSettings.saveError.value,
  status: youtubeLoginSettings.status.value,
  fileBusy: youtubeLoginSettings.fileBusy.value,
  fileError: youtubeLoginSettings.fileError.value,
  items: youtubeLoginSettings.items,
}));
const obsIntegrationSettings = useObsIntegrationSettings();
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

const PROCESSING_TOOL_ORDER = [
  FEATURE_DEPENDENCY_IDS.FFMPEG_GYAN_ESSENTIALS,
  'uvr-mdxnet-inst-hq-4',
  'uvr-mdxnet-kara-2',
  'uvr-mdxnet-inst-hq-3',
];

function orderedProcessingTools(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return PROCESSING_TOOL_ORDER.map((id) => byId.get(id)).filter(Boolean);
}

const processingToolsOpen = shallowRef(false);

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
    if (!section || section === 'testing') return;
    if (section === 'processing') processingToolsOpen.value = true;
    clearSettingsSection();
    const outputFeature = {
      'obs-connection': FEATURE_IDS.OBS_INTEGRATION,
      'output-browser': FEATURE_IDS.PUBLIC_OUTPUT_FLOW,
    }[section];
    if (outputFeature) {
      await revealSettingsTarget(`settings-feature-${outputFeature}`);
      return;
    }
    await revealSettingsTarget(
      [
        'application',
        'support',
        'platform-accounts',
        'capture-output',
      ].includes(section)
        ? `settings-${section}`
        : `settings-group-${section}`,
    );
  },
  { immediate: true },
);

watch(
  () => featureGateAccessState.request,
  async (request) => {
    const featureId = request?.featureId;
    if (featureId === FEATURE_IDS.AUDIO_PROCESSING_FLOW) {
      processingToolsOpen.value = true;
    }
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

async function handleClearObsPassword() {
  const confirmed = await confirmAction({
    title: t('capabilities.confirm.removeObsPasswordTitle'),
    message: t('capabilities.confirm.removeObsPasswordMessage'),
    detail: t('capabilities.confirm.removeObsPasswordDetail'),
    confirmLabel: t('capabilities.confirm.removePassword'),
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
      title: t('capabilities.confirm.removeItemTitle', { name: itemTitle }),
      message: t('capabilities.confirm.removeItemMessage'),
      detail: t('capabilities.confirm.removeItemDetail'),
      confirmLabel: t('capabilities.confirm.removeComponent'),
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
  separationSettings.refreshPreference();
  separationSettings.refreshAutoSeparation();
  youtubeLoginSettings.refresh();
  obsIntegrationSettings.refreshSettings();
});

// A redirect is for this visit; a later visit should not reopen at it.
onUnmounted(() => clearFeatureGateRequest());
</script>

<template>
  <div id="settings-optional" class="settings-capabilities-section">
    <UiNotice
      v-if="featureGateState.readError"
      tone="danger"
      :title="t('capabilities.unreadableTitle')"
      :message="featureGateState.readError"
      :action-label="t('capabilities.reload')"
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
      <template v-for="group in optionalFeatureGroups" :key="group.id">
        <SettingsSection
          :id="`settings-group-${group.id}`"
          class="settings-capabilities-section__group"
          :title="group.title"
          tabindex="-1"
        >
          <slot v-if="group.id === 'output'" name="output-start" />
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
            :custom-tools="gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW"
            :highlighted="
              featureGateAccessState.request?.featureId === gate.id &&
              (featureGateAccessState.request?.kind === 'setup' ||
                !gate.enabled)
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
              <YoutubeLoginRow
                v-if="gate.id === FEATURE_IDS.PROVIDER_FLOW && gate.enabled"
                :login="youtubeLogin"
                @set-source="youtubeLoginSettings.setSource"
                @import-file="youtubeLoginSettings.importFile"
                @remove-file="youtubeLoginSettings.removeFile"
                @refresh="youtubeLoginSettings.refresh"
              />
              <CompanionSettingsBlock
                v-if="gate.id === FEATURE_IDS.MOBILE_COMPANION && gate.enabled"
              />
              <OutputRuntimeSettingsBlock
                v-if="
                  gate.id === FEATURE_IDS.PUBLIC_OUTPUT_FLOW && gate.enabled
                "
              />
              <ObsIntegrationSettingsBlock
                v-if="
                  gate.id === FEATURE_IDS.OBS_INTEGRATION &&
                  (gate.enabled ||
                    obsIntegrationSettings.hasStoredPassword.value)
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
                @update:password="
                  obsIntegrationSettings.password.value = $event
                "
                @update:skip-threshold-seconds="
                  obsIntegrationSettings.skipThresholdSeconds.value = $event
                "
                @save="obsIntegrationSettings.save"
                @clear-password="handleClearObsPassword"
                @retry-connect="obsIntegrationSettings.retryConnect"
              />
            </template>
            <template #tools>
              <template v-if="gate.id === FEATURE_IDS.AUDIO_PROCESSING_FLOW">
                <SeparationAutoSettingsRow
                  :auto-separate="separationSettings.autoSeparate.value"
                  :busy="separationSettings.autoSeparationBusy.value"
                  :error="separationSettings.autoSeparationSaveError.value"
                  :read-error="separationSettings.autoSeparationReadError.value"
                  :reading="separationSettings.autoSeparationReading.value"
                  :loaded="separationSettings.autoSeparationLoaded.value"
                  @refresh-preference="separationSettings.refreshAutoSeparation"
                  @set-auto-separate="separationSettings.setAutoSeparate"
                />
                <UiDisclosure
                  v-model:open="processingToolsOpen"
                  class="settings-section__disclosure"
                  :label="t('capabilities.manageProcessingTools')"
                >
                  <SettingsDependencyRows
                    :items="orderedProcessingTools(gate.items)"
                    @item-action="handleWorkflowItemAction"
                    @item-advanced-action="handleWorkflowItemAdvancedAction"
                    @notice-action="handleFeatureDependencyNoticeAction"
                  >
                    <template #after>
                      <SeparationGpuSettingsRow
                        :gpu-acceleration="
                          separationSettings.gpuAcceleration.value
                        "
                        :preference-busy="
                          separationSettings.preferenceBusy.value
                        "
                        :preference-error="
                          separationSettings.preferenceSaveError.value
                        "
                        :read-error="
                          separationSettings.preferenceReadError.value
                        "
                        :reading="separationSettings.preferenceReading.value"
                        :loaded="separationSettings.preferenceLoaded.value"
                        @refresh-preference="
                          separationSettings.refreshPreference
                        "
                        @set-gpu-acceleration="
                          separationSettings.setGpuAcceleration
                        "
                      />
                    </template>
                  </SettingsDependencyRows>
                </UiDisclosure>
              </template>
            </template>
          </SettingsFeatureGateRow>
        </SettingsSection>
      </template>
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
