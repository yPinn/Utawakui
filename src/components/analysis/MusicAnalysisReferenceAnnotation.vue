<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { useMusicAnalysisReferenceAnnotation } from '../../composables/useMusicAnalysisReferenceAnnotation.js';
import { createMusicStructureSignals } from '../../composables/useMusicStructureSignals.js';
import { usePlayer } from '../../composables/usePlayer.js';
import {
  blindReferenceBeatGrid,
  formatReferenceTime,
} from '../../utils/musicAnalysisReferenceAnnotation.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';
import MusicAnalysisReferenceEditor from './MusicAnalysisReferenceEditor.vue';

const annotation = useMusicAnalysisReferenceAnnotation();
const library = useLibrary();
const player = usePlayer();
const structureSignals = createMusicStructureSignals();
const playbackError = ref(null);
const snapToDownbeats = shallowRef(true);

const selectedTrack = computed(() =>
  annotation.selectedCase.value
    ? (library.tracksById.value.get(annotation.selectedCase.value.trackId) ??
      null)
    : null,
);
const isCurrentTrack = computed(
  () => player.state.track?.id === selectedTrack.value?.id,
);
const currentTimeMs = computed(() =>
  isCurrentTrack.value ? player.state.currentTime * 1000 : 0,
);
const completedCount = computed(
  () =>
    annotation.dataset.value?.cases.filter((item) => item.complete).length ?? 0,
);
const hasNextIncomplete = computed(() =>
  Boolean(
    annotation.dataset.value?.cases.some(
      (item) => !item.complete && item.id !== annotation.selectedCaseId.value,
    ),
  ),
);
const m1Beats = computed(() =>
  blindReferenceBeatGrid(
    structureSignals.current.value,
    annotation.selectedCase.value?.trackId,
  ),
);

watch(
  () => annotation.selectedCase.value?.trackId ?? null,
  (trackId) => {
    if (!trackId) {
      structureSignals.clear();
      return;
    }
    void structureSignals.loadForTrack(trackId);
  },
  { immediate: true },
);

function caseTitle(referenceCase) {
  return (
    library.tracksById.value.get(referenceCase.trackId)?.title ??
    referenceCase.id
  );
}

function caseArtist(referenceCase) {
  return (
    library.tracksById.value.get(referenceCase.trackId)?.artist ??
    referenceCase.trackId
  );
}

function selectCase(caseId) {
  playbackError.value = null;
  annotation.selectCase(caseId);
}

async function loadSelectedTrack() {
  playbackError.value = null;
  if (!selectedTrack.value) {
    playbackError.value = {
      title: '曲目不在目前曲庫',
      message: '此案例無法播放；請確認工作集與目前曲庫一致。',
    };
    return false;
  }
  if (!isCurrentTrack.value) {
    await player.playTrack(toPlayableTrack(selectedTrack.value));
  } else {
    await player.play();
  }
  return true;
}

async function seekTo(milliseconds) {
  if (!(await loadSelectedTrack())) return;
  player.seek(milliseconds / 1000);
}

function addBoundary(milliseconds) {
  if (!annotation.selectedCase.value) return;
  annotation.addBoundary(annotation.selectedCase.value.id, milliseconds);
}

function addBoundaryWithRole(milliseconds, role) {
  if (!annotation.selectedCase.value) return;
  annotation.addBoundaryWithRole(
    annotation.selectedCase.value.id,
    milliseconds,
    role,
  );
}

function moveBoundary(index, milliseconds) {
  if (!annotation.selectedCase.value) return;
  annotation.moveBoundary(
    annotation.selectedCase.value.id,
    index,
    milliseconds,
  );
}

function selectNextIncomplete() {
  playbackError.value = null;
  annotation.selectNextIncomplete();
}

function removeBoundary(index) {
  if (!annotation.selectedCase.value) return;
  annotation.removeBoundary(annotation.selectedCase.value.id, index);
}

function updateBpm(value) {
  if (!annotation.selectedCase.value) return;
  annotation.updateBpm(annotation.selectedCase.value.id, value);
}

function updateRole(index, role) {
  if (!annotation.selectedCase.value) return;
  annotation.updateRole(annotation.selectedCase.value.id, index, role);
}

function updateSnapToDownbeats(value) {
  snapToDownbeats.value = value;
}

function retryErrorAction() {
  if (annotation.error.value?.actionLabel === '重試儲存') annotation.save();
  else openWorklist();
}

function openWorklist() {
  if (
    annotation.dirty.value &&
    typeof window !== 'undefined' &&
    !window.confirm('目前有尚未儲存的人工標註，仍要更換工作集？')
  ) {
    return;
  }
  annotation.open();
}

onMounted(library.initialize);
onUnmounted(structureSignals.clear);
</script>

<template>
  <section
    class="reference-annotation"
    aria-labelledby="reference-annotation-title"
  >
    <header class="reference-annotation__toolbar">
      <div>
        <h2 id="reference-annotation-title">M2 人工標註</h2>
        <UiHint>盲標模式，不讀取模型預測；只在工作集內儲存。</UiHint>
      </div>
      <div class="reference-annotation__actions">
        <span v-if="annotation.dirty.value" class="reference-annotation__dirty">
          等待自動儲存
        </span>
        <UiButton
          v-if="annotation.dataset.value"
          :disabled="!annotation.dirty.value"
          :loading="annotation.saving.value"
          loading-label="儲存中"
          @click="annotation.save"
        >
          儲存
        </UiButton>
        <UiButton
          variant="accent"
          :disabled="annotation.loading.value || annotation.saving.value"
          @click="openWorklist"
        >
          {{
            annotation.loading.value
              ? '讀取中…'
              : annotation.dataset.value
                ? '更換工作集'
                : '開啟工作集'
          }}
        </UiButton>
      </div>
    </header>

    <UiNotice
      v-if="annotation.error.value"
      :notice="annotation.error.value"
      tone="danger"
      @action="retryErrorAction"
    />

    <div v-if="!annotation.dataset.value" class="reference-annotation__empty">
      <UiChip tone="gated">Reference only</UiChip>
      <h3>選擇 M2 run config</h3>
      <p>逐首播放並標記 BPM、段落邊界與角色；這裡不顯示分析結果。</p>
      <UiButton
        variant="accent"
        :disabled="annotation.loading.value"
        @click="openWorklist"
      >
        選擇 run config
      </UiButton>
    </div>

    <div v-else class="reference-annotation__workspace">
      <aside class="reference-annotation__cases" aria-label="人工標註案例">
        <div class="reference-annotation__summary">
          <div>
            <span>WORKLIST</span>
            <strong>{{ annotation.dataset.value.benchmarkId }}</strong>
          </div>
          <UiChip
            :tone="
              completedCount === annotation.dataset.value.cases.length
                ? 'success'
                : 'warning'
            "
          >
            {{ completedCount }}/{{ annotation.dataset.value.cases.length }}
          </UiChip>
        </div>

        <UiScrollRegion
          class="reference-annotation__case-list"
          axis="vertical"
          viewport-tag="ol"
          viewport-class="reference-annotation__case-list-viewport"
        >
          <UiTrackRow
            v-for="referenceCase in annotation.dataset.value.cases"
            :key="referenceCase.id"
            :title="caseTitle(referenceCase)"
            :artist="caseArtist(referenceCase)"
            :active="annotation.selectedCaseId.value === referenceCase.id"
            interactive
            :action-label="`標註 ${caseTitle(referenceCase)}`"
            hide-duration
            overflow="ellipsis"
            @row-click="selectCase(referenceCase.id)"
          >
            <template #trail>
              <UiChip :tone="referenceCase.complete ? 'success' : 'muted'">
                {{ referenceCase.complete ? '完成' : '待標' }}
              </UiChip>
            </template>
          </UiTrackRow>
        </UiScrollRegion>
      </aside>

      <article
        v-if="annotation.selectedCase.value"
        class="reference-annotation__detail"
      >
        <header class="reference-annotation__case-header">
          <div>
            <span>{{ annotation.selectedCase.value.id }}</span>
            <h3>{{ caseTitle(annotation.selectedCase.value) }}</h3>
            <p>
              {{ caseArtist(annotation.selectedCase.value) }} ·
              {{
                formatReferenceTime(annotation.selectedCase.value.durationMs)
              }}
            </p>
          </div>
          <div class="reference-annotation__case-actions">
            <UiButton variant="accent" @click="loadSelectedTrack">
              {{ isCurrentTrack ? '繼續播放' : '載入並播放' }}
            </UiButton>
            <UiButton
              :disabled="!hasNextIncomplete"
              @click="selectNextIncomplete"
            >
              N 下一首待標
            </UiButton>
          </div>
        </header>

        <UiScrollRegion
          class="reference-annotation__detail-scroll"
          axis="vertical"
          viewport-class="reference-annotation__detail-viewport"
        >
          <UiNotice
            v-if="playbackError"
            :notice="playbackError"
            tone="warning"
          />

          <MusicAnalysisReferenceEditor
            :annotation-case="annotation.selectedCase.value"
            :allowed-roles="annotation.dataset.value.allowedRoles"
            :current-time-ms="currentTimeMs"
            :is-current-track="isCurrentTrack"
            :beats="m1Beats"
            :snap-to-downbeats="snapToDownbeats"
            @add-boundary="addBoundary"
            @add-boundary-with-role="addBoundaryWithRole"
            @move-boundary="moveBoundary"
            @next-incomplete="selectNextIncomplete"
            @remove-boundary="removeBoundary"
            @save="annotation.save"
            @seek="seekTo"
            @update:snap-to-downbeats="updateSnapToDownbeats"
            @update-bpm="updateBpm"
            @update-role="updateRole"
          />
        </UiScrollRegion>
      </article>
    </div>
  </section>
</template>

<style scoped>
.reference-annotation {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.reference-annotation__toolbar,
.reference-annotation__actions,
.reference-annotation__summary,
.reference-annotation__case-header,
.reference-annotation__case-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.reference-annotation__toolbar h2,
.reference-annotation__empty h3,
.reference-annotation__empty p,
.reference-annotation__case-header h3,
.reference-annotation__case-header p {
  margin: 0;
}

.reference-annotation__toolbar h2 {
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.reference-annotation__dirty {
  color: var(--ui-color-warning);
  font-size: var(--ui-font-size-sm);
}

.reference-annotation__empty {
  flex: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-6);
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
  text-align: center;
}

.reference-annotation__empty p {
  max-width: 38rem;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.reference-annotation__workspace {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(16rem, 21rem) minmax(0, 1fr);
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.reference-annotation__cases,
.reference-annotation__detail {
  min-width: 0;
  min-height: 0;
}

.reference-annotation__cases {
  display: flex;
  flex-direction: column;
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-raised) 48%,
    var(--ui-color-surface)
  );
}

.reference-annotation__summary {
  padding: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.reference-annotation__summary > div {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.reference-annotation__summary span,
.reference-annotation__case-header > div > span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.reference-annotation__summary strong {
  overflow-wrap: anywhere;
}

.reference-annotation__case-list {
  min-height: 0;
  flex: 1;
}

.reference-annotation__case-list
  :deep(.reference-annotation__case-list-viewport) {
  margin: 0;
  padding: var(--ui-space-1) var(--ui-space-2);
  list-style: none;
  overscroll-behavior: contain;
}
.reference-annotation__case-header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.reference-annotation__detail {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-5);
  padding: var(--ui-space-4);
}

.reference-annotation__detail-scroll {
  min-height: 0;
}

.reference-annotation__detail-scroll
  :deep(.reference-annotation__detail-viewport) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
  overscroll-behavior: contain;
}

.reference-annotation__case-header {
  align-items: flex-start;
}

.reference-annotation__case-header > div {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.reference-annotation__case-header h3 {
  overflow-wrap: anywhere;
  font-size: var(--ui-font-size-xl);
  line-height: var(--ui-line-height-title);
}

@media (max-width: 840px) {
  .reference-annotation__workspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(11rem, 38%) minmax(0, 1fr);
  }

  .reference-annotation__cases {
    border-inline-end: 0;
    border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  }
}
</style>
