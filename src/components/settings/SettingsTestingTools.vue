<script setup>
import { computed, defineAsyncComponent, watch } from 'vue';
import { FEATURE_IDS } from '../../constants/featureGates.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useFeatureGates } from '../../composables/useFeatureGates.js';
import { useMusicAnalysisSettings } from '../../composables/useMusicAnalysisSettings.js';
import { useLyricsAcousticCapability } from '../../composables/lyrics/useLyricsAcousticCapability.js';
import { t } from '../../utils/i18n.js';
import LyricsAcousticSettingsRow from './LyricsAcousticSettingsRow.vue';
import LyricsResearchSettingsBlock from './LyricsResearchSettingsBlock.vue';
import MusicAnalysisSettingsRow from './MusicAnalysisSettingsRow.vue';
import SettingsDependencyRows from './SettingsDependencyRows.vue';
import SpoutOutputSettingsRow from './SpoutOutputSettingsRow.vue';

const GuidePitchSettingsRow = import.meta.env.DEV
  ? defineAsyncComponent(() => import('./GuidePitchSettingsRow.vue'))
  : null;

const { isFeatureEnabled } = useFeatureGates();
const audioProcessingEnabled = computed(() =>
  isFeatureEnabled(FEATURE_IDS.AUDIO_PROCESSING_FLOW),
);
const { confirm: confirmAction } = useAppConfirmation();
const musicAnalysisSettings = useMusicAnalysisSettings();
const lyricsAcousticCapability = useLyricsAcousticCapability();

async function handleRemoveMusicAnalysis() {
  const confirmed = await confirmAction({
    title: t('capabilities.confirm.removeBpmTitle'),
    message: t('capabilities.confirm.removeBpmMessage'),
    detail: t('capabilities.confirm.removeBpmDetail'),
    confirmLabel: t('capabilities.confirm.removeComponent'),
    intent: 'danger',
  });
  if (!confirmed) return;

  await musicAnalysisSettings.remove();
}

async function handleRemoveLyricsAcoustic() {
  const confirmed = await confirmAction({
    title: t('capabilities.confirm.removeAcousticTitle'),
    message: t('capabilities.confirm.removeAcousticMessage'),
    detail: t('capabilities.confirm.removeAcousticDetail'),
    confirmLabel: t('capabilities.confirm.removeComponent'),
    intent: 'danger',
  });
  if (confirmed) await lyricsAcousticCapability.remove();
}

watch(
  audioProcessingEnabled,
  (enabled) => {
    if (!enabled) return;
    musicAnalysisSettings.initialize();
    lyricsAcousticCapability.refresh();
  },
  { immediate: true },
);
</script>

<template>
  <SettingsDependencyRows>
    <LyricsResearchSettingsBlock>
      <LyricsAcousticSettingsRow
        v-if="audioProcessingEnabled"
        :capability="lyricsAcousticCapability.capability.value"
        :busy="lyricsAcousticCapability.busy.value"
        :operation="lyricsAcousticCapability.operation.value"
        :error="lyricsAcousticCapability.error.value"
        @refresh="lyricsAcousticCapability.refresh"
        @prepare="lyricsAcousticCapability.prepare"
        @verify="lyricsAcousticCapability.verify"
        @repair="lyricsAcousticCapability.repair"
        @remove="handleRemoveLyricsAcoustic"
        @cancel="lyricsAcousticCapability.cancel"
      />
    </LyricsResearchSettingsBlock>
    <template v-if="audioProcessingEnabled">
      <MusicAnalysisSettingsRow
        :capability="musicAnalysisSettings.capability.value"
        :capability-busy="musicAnalysisSettings.capabilityBusy.value"
        :stage-label="musicAnalysisSettings.stageLabel.value"
        :progress-percent="musicAnalysisSettings.progressPercent.value"
        :capability-error="musicAnalysisSettings.capabilityError.value"
        :capability-read-error="musicAnalysisSettings.capabilityReadError.value"
        :preference="{
          autoAnalyze: musicAnalysisSettings.autoAnalyze.value,
          busy: musicAnalysisSettings.preferenceBusy.value,
          reading: musicAnalysisSettings.preferenceReading.value,
          loaded: musicAnalysisSettings.preferenceLoaded.value,
          error: musicAnalysisSettings.preferenceSaveError.value,
          readError: musicAnalysisSettings.preferenceReadError.value,
        }"
        @refresh-capability="musicAnalysisSettings.refreshCapability"
        @prepare="musicAnalysisSettings.prepare"
        @repair="musicAnalysisSettings.repair"
        @remove="handleRemoveMusicAnalysis"
        @refresh-preference="musicAnalysisSettings.refreshPreference"
        @set-auto-analyze="musicAnalysisSettings.setAutoAnalyze"
      />
      <GuidePitchSettingsRow v-if="GuidePitchSettingsRow" />
    </template>
    <SpoutOutputSettingsRow
      v-if="isFeatureEnabled(FEATURE_IDS.PUBLIC_OUTPUT_FLOW)"
    />
  </SettingsDependencyRows>
</template>
