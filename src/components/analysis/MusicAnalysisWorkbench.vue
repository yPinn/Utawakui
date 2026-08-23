<script setup>
import { onMounted, onUnmounted } from 'vue';
import { useMusicAnalysisWorkbench } from '../../composables/useMusicAnalysisWorkbench.js';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import MusicAnalysisJobPanel from './MusicAnalysisJobPanel.vue';
import MusicAnalysisTrackPicker from './MusicAnalysisTrackPicker.vue';
import MusicStructureSummary from './MusicStructureSummary.vue';

const workbench = useMusicAnalysisWorkbench();

onMounted(workbench.initialize);
onUnmounted(workbench.dispose);
</script>

<template>
  <div class="analysis-workbench">
    <UiPageHeader title="音樂結構分析">
      <template #actions>
        <UiChip tone="gated">內部工具 · F10</UiChip>
      </template>
    </UiPageHeader>

    <UiNotice
      tone="warning"
      title="尚未是正式產品功能"
      message="分析端 IPC 與 sidecar 讀取流程已接通；模型授權、產品 activation、安裝與離線發行條件尚未完成。"
    />
    <UiNotice
      v-if="workbench.libraryState.error"
      :notice="workbench.libraryState.error"
      @action="workbench.retryLibrary"
    />

    <div class="analysis-workbench__layout">
      <aside class="analysis-workbench__tracks">
        <MusicAnalysisTrackPicker
          :tracks="workbench.tracks.value"
          :selected-track-id="workbench.state.selectedTrackId"
          :selected-level="workbench.structure.value?.signals?.level"
          :loading="workbench.libraryState.isLoading"
          :disabled="
            !workbench.state.initialized ||
            workbench.libraryState.isLoading ||
            workbench.isBusy.value ||
            workbench.canCancel.value
          "
          @select="workbench.selectTrack"
        />
      </aside>

      <div class="analysis-workbench__detail">
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
          :can-cancel="workbench.canCancel.value"
          @analyze="workbench.analyzeSelectedTrack"
          @cancel="workbench.cancelAnalysis"
          @reload="workbench.refreshSelectedTrack"
        />
        <MusicStructureSummary :result="workbench.structure.value" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.analysis-workbench {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.analysis-workbench :deep(.ui-page-header) {
  margin-bottom: 0;
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

.analysis-workbench__detail > * + * {
  padding-block-start: var(--ui-space-5);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
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
