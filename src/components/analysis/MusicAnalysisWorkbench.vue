<script setup>
import { onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { useMusicAnalysisWorkbench } from '../../composables/useMusicAnalysisWorkbench.js';
import { Info } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import MusicAnalysisBatchPanel from './MusicAnalysisBatchPanel.vue';
import MusicAnalysisCapabilityModal from './MusicAnalysisCapabilityModal.vue';
import MusicAnalysisJobPanel from './MusicAnalysisJobPanel.vue';
import MusicAnalysisTrackPicker from './MusicAnalysisTrackPicker.vue';
import MusicStructureSummary from './MusicStructureSummary.vue';

const workbench = useMusicAnalysisWorkbench();
const showCapabilityDetails = shallowRef(false);
const analysisMode = shallowRef('single');

function setAnalysisMode(mode) {
  if (workbench.batch.active.value) return;
  analysisMode.value = mode;
}

function setBatchSelection({ trackIds, selected }) {
  workbench.batch.setTracksSelected(trackIds, selected);
}

async function removeCapability() {
  const confirmed =
    typeof window === 'undefined' ||
    window.confirm('移除本機音樂分析功能？歌曲、歌詞與既有 sidecar 都會保留。');
  if (confirmed) await workbench.removeCapability();
}

onMounted(workbench.initialize);
onUnmounted(workbench.dispose);
watch(
  () => workbench.batch.active.value,
  (active) => {
    if (active) analysisMode.value = 'batch';
  },
);
</script>

<template>
  <div class="analysis-workbench">
    <UiPageHeader title="音樂結構分析">
      <template #actions>
        <div class="analysis-workbench__header-actions">
          <UiIconButton
            :icon="Info"
            label="查看分析功能資訊"
            title="模型、下載大小與維護資訊"
            size="sm"
            @click="showCapabilityDetails = true"
          />
          <UiChip tone="gated">內部工具 · F10</UiChip>
        </div>
      </template>
    </UiPageHeader>

    <UiNotice
      v-if="workbench.libraryState.error"
      :notice="workbench.libraryState.error"
      @action="workbench.retryLibrary"
    />

    <div class="analysis-workbench__layout">
      <aside class="analysis-workbench__tracks">
        <MusicAnalysisTrackPicker
          :tracks="workbench.tracks.value"
          :mode="analysisMode"
          :selected-track-id="workbench.state.selectedTrackId"
          :loading="workbench.libraryState.isLoading"
          :batch-available="workbench.capabilityReady.value"
          :batch-selected-track-ids="workbench.batch.selectedTrackIds.value"
          :batch-items-by-track-id="workbench.batch.itemsByTrackId.value"
          :disabled="
            !workbench.state.initialized ||
            workbench.libraryState.isLoading ||
            workbench.capabilityBusy.value ||
            workbench.isBusy.value ||
            Boolean(workbench.state.activeJob)
          "
          @select="workbench.selectTrack"
          @mode-change="setAnalysisMode"
          @set-batch-selection="setBatchSelection"
          @clear-batch="workbench.batch.clearSelection"
        />
      </aside>

      <div class="analysis-workbench__detail">
        <MusicAnalysisBatchPanel
          v-if="analysisMode === 'batch'"
          :selected-count="workbench.batch.selectedTrackIds.value.length"
          :batch="workbench.batch.batch.value"
          :active="workbench.batch.active.value"
          :capability-ready="workbench.capabilityReady.value"
          :disabled="
            workbench.isBusy.value ||
            workbench.capabilityBusy.value ||
            Boolean(workbench.state.activeJob)
          "
          :error="workbench.batch.error.value"
          :summary="workbench.batch.summary.value"
          @start="workbench.startBatchAnalysis"
          @cancel="workbench.cancelBatchAnalysis"
        />
        <template v-else>
          <MusicAnalysisJobPanel
            :selected-track="workbench.selectedTrack.value"
            :active-job="workbench.state.activeJob"
            :error="workbench.state.error"
            :notice="workbench.state.notice"
            :phase-label="workbench.phaseLabel.value"
            :stage-label="workbench.stageLabel.value"
            :progress-percent="workbench.progressPercent.value"
            :busy="workbench.isBusy.value"
            :can-analyze="workbench.canAnalyze.value"
            :can-cancel="
              workbench.canCancel.value && !workbench.batch.active.value
            "
            :capability="workbench.capability.value"
            :capability-stage-label="workbench.capabilityStageLabel.value"
            :capability-progress-percent="
              workbench.capabilityProgressPercent.value
            "
            :capability-busy="workbench.capabilityBusy.value"
            :capability-error="workbench.state.capabilityError"
            @analyze="workbench.analyzeSelectedTrack"
            @cancel="workbench.cancelAnalysis"
            @reload="workbench.refreshSelectedTrack"
            @prepare="workbench.prepareCapability"
            @repair="workbench.repairCapability"
          />
          <MusicStructureSummary :result="workbench.structure.value" />
        </template>
      </div>
    </div>

    <MusicAnalysisCapabilityModal
      :open="showCapabilityDetails"
      :capability="workbench.capability.value"
      :busy="
        workbench.capabilityBusy.value ||
        workbench.batch.active.value ||
        Boolean(workbench.state.activeJob)
      "
      @close="showCapabilityDetails = false"
      @repair="workbench.repairCapability"
      @remove="removeCapability"
    />
  </div>
</template>

<style scoped>
.analysis-workbench {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  user-select: none;
}

.analysis-workbench :deep(.ui-page-header) {
  margin-bottom: 0;
}

.analysis-workbench__header-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.analysis-workbench__layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(16rem, 21rem) minmax(0, 1fr);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
  overflow: hidden;
}

.analysis-workbench__tracks,
.analysis-workbench__detail {
  min-width: 0;
  min-height: 0;
  padding: var(--ui-space-4);
}

.analysis-workbench__tracks {
  overflow: hidden;
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-raised) 48%,
    var(--ui-color-surface)
  );
}

.analysis-workbench__detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.analysis-workbench :deep(input[type='search']),
.analysis-workbench :deep(input[type='text']) {
  user-select: text;
}

@media (max-width: 840px) {
  .analysis-workbench__layout {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(11rem, 38%) minmax(0, 1fr);
  }

  .analysis-workbench__tracks {
    border-inline-end: 0;
    border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  }
}
</style>
