<script setup>
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue';
import { useMusicAnalysisWorkbench } from '../../composables/useMusicAnalysisWorkbench.js';
import { Info } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiStack from '../ui/UiStack.vue';
import UiSurface from '../ui/UiSurface.vue';
import MusicAnalysisBatchPanel from './MusicAnalysisBatchPanel.vue';
import MusicAnalysisBenchmarkReview from './MusicAnalysisBenchmarkReview.vue';
import MusicAnalysisCapabilityModal from './MusicAnalysisCapabilityModal.vue';
import MusicAnalysisJobPanel from './MusicAnalysisJobPanel.vue';
import MusicAnalysisReferenceAnnotation from './MusicAnalysisReferenceAnnotation.vue';
import MusicAnalysisTrackPicker from './MusicAnalysisTrackPicker.vue';
import MusicStructureSummary from './MusicStructureSummary.vue';

const workbench = useMusicAnalysisWorkbench();
const showCapabilityDetails = shallowRef(false);
const workbenchMode = shallowRef('analysis');
const analysisMode = shallowRef('single');
const modeSwitchDisabled = computed(
  () =>
    workbench.isBusy.value ||
    workbench.capabilityBusy.value ||
    workbench.batch.active.value ||
    Boolean(workbench.state.activeJob),
);

function setWorkbenchMode(mode) {
  if (modeSwitchDisabled.value) return;
  workbenchMode.value = mode;
}

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
    window.confirm('移除本機音樂分析功能？歌曲、歌詞與既有分析結果都會保留。');
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
  <UiStack class="analysis-workbench" direction="column" :gap="4">
    <UiPageHeader title="音樂結構分析">
      <template #description>
        分析曲目的節奏與段落結構，並提供人工標註與 benchmark 比對工具。
      </template>
      <template #actions>
        <UiStack
          class="analysis-workbench__header-actions"
          align="center"
          :gap="2"
        >
          <UiSurface
            class="analysis-workbench__mode-switch"
            tone="raised"
            role="group"
            aria-label="音樂分析工具模式"
          >
            <UiButton
              :active="workbenchMode === 'analysis'"
              :aria-pressed="workbenchMode === 'analysis'"
              :disabled="modeSwitchDisabled"
              @click="setWorkbenchMode('analysis')"
            >
              正式分析
            </UiButton>
            <UiButton
              :active="workbenchMode === 'annotation'"
              :aria-pressed="workbenchMode === 'annotation'"
              :disabled="modeSwitchDisabled"
              @click="setWorkbenchMode('annotation')"
            >
              人工標註
            </UiButton>
            <UiButton
              :active="workbenchMode === 'benchmark'"
              :aria-pressed="workbenchMode === 'benchmark'"
              :disabled="modeSwitchDisabled"
              @click="setWorkbenchMode('benchmark')"
            >
              Benchmark Review
            </UiButton>
          </UiSurface>
          <UiIconButton
            v-if="workbenchMode === 'analysis'"
            :icon="Info"
            label="查看分析功能資訊"
            title="模型、下載大小與維護資訊"
            @click="showCapabilityDetails = true"
          />
          <UiChip tone="gated">內部工具 · F5</UiChip>
        </UiStack>
      </template>
    </UiPageHeader>

    <UiNotice
      v-if="workbench.libraryState.error"
      :notice="workbench.libraryState.error"
      @action="workbench.retryLibrary"
    />

    <MusicAnalysisReferenceAnnotation v-if="workbenchMode === 'annotation'" />

    <MusicAnalysisBenchmarkReview v-else-if="workbenchMode === 'benchmark'" />

    <UiSurface v-else class="analysis-workbench__layout" radius="lg">
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

      <UiScrollRegion
        class="analysis-workbench__detail"
        axis="vertical"
        viewport-class="analysis-workbench__detail-viewport"
      >
        <UiStack direction="column" :gap="5">
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
        </UiStack>
      </UiScrollRegion>
    </UiSurface>

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
  </UiStack>
</template>

<style scoped>
.analysis-workbench {
  height: 100%;
  min-height: 0;
  user-select: none;
}

.analysis-workbench :deep(.ui-page-header) {
  margin-bottom: 0;
}

.analysis-workbench__mode-switch {
  display: inline-flex;
  align-items: center;
  padding: calc(var(--ui-space-1) / 2);
}

.analysis-workbench__mode-switch :deep(.ui-btn) {
  min-height: calc(var(--ui-control-height) - var(--ui-space-1));
}

.analysis-workbench__layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(16rem, 21rem) minmax(0, 1fr);
  overflow: hidden;
}

.analysis-workbench__tracks,
.analysis-workbench__detail {
  min-width: 0;
  min-height: 0;
}

.analysis-workbench__tracks {
  padding: var(--ui-space-4);
  overflow: hidden;
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-raised) 48%,
    var(--ui-color-surface)
  );
}

.analysis-workbench__detail :deep(.analysis-workbench__detail-viewport) {
  padding: var(--ui-space-4);
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
