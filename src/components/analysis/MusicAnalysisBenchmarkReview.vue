<script setup>
import { computed, onMounted, ref } from 'vue';
import { useLibrary } from '../../composables/useLibrary.js';
import { useMusicAnalysisBenchmarkReview } from '../../composables/useMusicAnalysisBenchmarkReview.js';
import { usePlayer } from '../../composables/usePlayer.js';
import {
  benchmarkM2Presentation,
  formatBenchmarkTime,
} from '../../utils/musicAnalysisBenchmark.js';
import { toPlayableTrack } from '../../utils/playableTrack.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import MusicAnalysisBenchmarkTimeline from './MusicAnalysisBenchmarkTimeline.vue';

const review = useMusicAnalysisBenchmarkReview();
const library = useLibrary();
const player = usePlayer();
const playbackError = ref(null);

const selectedTrack = computed(() =>
  review.selectedCase.value
    ? (library.tracksById.value.get(review.selectedCase.value.trackId) ?? null)
    : null,
);
const selectedEstimate = computed(() => review.selectedCase.value?.estimate);
const selectedSections = computed(() =>
  selectedEstimate.value?.status === 'completed'
    ? selectedEstimate.value.sections
    : [],
);
const selectedStatus = computed(() =>
  review.selectedCase.value
    ? benchmarkM2Presentation(review.selectedCase.value.m2Status)
    : null,
);
const currentTimeMs = computed(() =>
  player.state.track?.id === selectedTrack.value?.id
    ? player.state.currentTime * 1000
    : 0,
);
const m2Count = computed(
  () =>
    review.dataset.value?.cases.filter((item) => item.m2Status === 'current')
      .length ?? 0,
);

function caseTitle(benchmarkCase) {
  return (
    library.tracksById.value.get(benchmarkCase.trackId)?.title ??
    benchmarkCase.id
  );
}

function caseArtist(benchmarkCase) {
  return (
    library.tracksById.value.get(benchmarkCase.trackId)?.artist ??
    benchmarkCase.trackId
  );
}

function selectCase(caseId) {
  playbackError.value = null;
  review.selectCase(caseId);
}

async function seekTo(milliseconds) {
  playbackError.value = null;
  if (!selectedTrack.value) {
    playbackError.value = {
      title: '曲目不在目前曲庫',
      message: '此案例無法播放；請確認 benchmark run 與目前曲庫一致。',
    };
    return;
  }
  if (player.state.track?.id !== selectedTrack.value.id) {
    await player.playTrack(toPlayableTrack(selectedTrack.value));
  }
  player.seek(milliseconds / 1000);
}

onMounted(library.initialize);
</script>

<template>
  <section class="benchmark-review" aria-labelledby="benchmark-review-title">
    <header class="benchmark-review__toolbar">
      <div>
        <h2 id="benchmark-review-title" class="benchmark-review__title">
          M2 Benchmark Review
        </h2>
        <UiHint>只讀檢視候選段落；不會變更分析結果。</UiHint>
      </div>
      <UiButton
        variant="accent"
        :disabled="review.loading.value"
        @click="review.open"
      >
        {{
          review.loading.value
            ? '讀取中…'
            : review.dataset.value
              ? '更換結果'
              : '開啟結果'
        }}
      </UiButton>
    </header>

    <UiNotice
      v-if="review.error.value"
      :notice="review.error.value"
      tone="danger"
      @action="review.open"
    />

    <div v-if="!review.dataset.value" class="benchmark-review__empty">
      <UiChip tone="gated">Benchmark only</UiChip>
      <h3>選擇已完成的 M2 run config</h3>
      <p>畫面會讀取對應 predictions，顯示每首歌的段落、信心與降級原因。</p>
      <UiButton
        variant="accent"
        :disabled="review.loading.value"
        @click="review.open"
      >
        選擇 run config
      </UiButton>
    </div>

    <div v-else class="benchmark-review__workspace">
      <aside class="benchmark-review__cases" aria-label="Benchmark 案例">
        <div class="benchmark-review__run-summary">
          <div>
            <span class="benchmark-review__eyebrow">RUN</span>
            <strong>{{ review.dataset.value.benchmarkId }}</strong>
          </div>
          <UiChip
            :tone="
              m2Count === review.dataset.value.cases.length
                ? 'success'
                : 'warning'
            "
          >
            {{ m2Count }}/{{ review.dataset.value.cases.length }} M2
          </UiChip>
        </div>

        <ol class="benchmark-review__case-list">
          <li
            v-for="benchmarkCase in review.dataset.value.cases"
            :key="benchmarkCase.id"
          >
            <button
              class="benchmark-review__case"
              :class="{
                'benchmark-review__case--selected':
                  review.selectedCaseId.value === benchmarkCase.id,
              }"
              type="button"
              :aria-pressed="review.selectedCaseId.value === benchmarkCase.id"
              @click="selectCase(benchmarkCase.id)"
            >
              <span class="benchmark-review__case-copy">
                <strong>{{ caseTitle(benchmarkCase) }}</strong>
                <span>{{ caseArtist(benchmarkCase) }}</span>
              </span>
              <UiChip
                :tone="
                  benchmarkCase.m2Status === 'current' ? 'success' : 'warning'
                "
              >
                {{ benchmarkCase.m2Status === 'current' ? 'M2' : 'M1' }}
              </UiChip>
            </button>
          </li>
        </ol>
      </aside>

      <article
        v-if="review.selectedCase.value"
        class="benchmark-review__detail"
      >
        <header class="benchmark-review__case-header">
          <div>
            <span class="benchmark-review__eyebrow">{{
              review.selectedCase.value.id
            }}</span>
            <h3>{{ caseTitle(review.selectedCase.value) }}</h3>
            <p>{{ caseArtist(review.selectedCase.value) }}</p>
          </div>
          <UiChip :tone="selectedStatus.tone">{{
            selectedStatus.label
          }}</UiChip>
        </header>

        <UiNotice v-if="playbackError" :notice="playbackError" tone="warning" />

        <dl class="benchmark-review__metrics">
          <div>
            <dt>BPM</dt>
            <dd>
              {{
                selectedEstimate?.status === 'completed'
                  ? (selectedEstimate.bpm ?? '—')
                  : '—'
              }}
            </dd>
          </div>
          <div>
            <dt>段落</dt>
            <dd>{{ selectedSections.length }}</dd>
          </div>
          <div>
            <dt>曲長</dt>
            <dd>
              {{ formatBenchmarkTime(review.selectedCase.value.durationMs) }}
            </dd>
          </div>
          <div>
            <dt>CPU 分析</dt>
            <dd>{{ (review.selectedCase.value.wallMs / 1000).toFixed(1) }}s</dd>
          </div>
        </dl>

        <MusicAnalysisBenchmarkTimeline
          :duration-ms="review.selectedCase.value.durationMs"
          :current-time-ms="currentTimeMs"
          :m2-status="review.selectedCase.value.m2Status"
          :sections="selectedSections"
          @seek="seekTo"
        />

        <footer class="benchmark-review__provenance">
          <span
            >{{ review.dataset.value.analyzer.id }} v{{
              review.dataset.value.analyzer.version
            }}</span
          >
          <span>{{ review.dataset.value.analyzer.profileId }}</span>
          <span>{{ review.dataset.value.analyzer.modelId }}</span>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
.benchmark-review {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.benchmark-review__toolbar,
.benchmark-review__run-summary,
.benchmark-review__case-header,
.benchmark-review__provenance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.benchmark-review__title,
.benchmark-review__case-header h3,
.benchmark-review__case-header p,
.benchmark-review__empty h3,
.benchmark-review__empty p {
  margin: 0;
}

.benchmark-review__title {
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.benchmark-review__empty {
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

.benchmark-review__empty p {
  max-width: 38rem;
  color: var(--ui-color-text-muted);
  line-height: var(--ui-line-height-body);
}

.benchmark-review__workspace {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(16rem, 21rem) minmax(0, 1fr);
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.benchmark-review__cases,
.benchmark-review__detail {
  min-width: 0;
  min-height: 0;
}

.benchmark-review__cases {
  display: flex;
  flex-direction: column;
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
  background: color-mix(
    in srgb,
    var(--ui-color-surface-raised) 48%,
    var(--ui-color-surface)
  );
}

.benchmark-review__run-summary {
  padding: var(--ui-space-3);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.benchmark-review__run-summary > div {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.benchmark-review__run-summary strong {
  overflow-wrap: anywhere;
}

.benchmark-review__eyebrow {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.benchmark-review__case-list {
  min-height: 0;
  flex: 1;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  overscroll-behavior: contain;
}

.benchmark-review__case {
  width: 100%;
  min-height: var(--ui-track-row-min-height);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 0;
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  background: transparent;
  color: var(--ui-color-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.benchmark-review__case:hover {
  background: var(--ui-color-surface-hover);
}

.benchmark-review__case--selected {
  background: var(--ui-color-surface-selected);
  box-shadow: inset var(--ui-focus-width) 0 0 var(--ui-color-current);
}

.benchmark-review__case:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.benchmark-review__case-copy {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.benchmark-review__case-copy strong,
.benchmark-review__case-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.benchmark-review__case-copy span,
.benchmark-review__case-header p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.benchmark-review__detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
  padding: var(--ui-space-4);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.benchmark-review__case-header {
  align-items: flex-start;
}

.benchmark-review__case-header > div {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.benchmark-review__case-header h3 {
  overflow-wrap: anywhere;
  font-size: var(--ui-font-size-xl);
  line-height: var(--ui-line-height-title);
}

.benchmark-review__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-2);
  margin: 0;
}

.benchmark-review__metrics > div {
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface-raised);
}

.benchmark-review__metrics dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.benchmark-review__metrics dd {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  font-variant-numeric: tabular-nums;
}

.benchmark-review__provenance {
  flex-wrap: wrap;
  justify-content: flex-start;
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  overflow-wrap: anywhere;
}

@media (max-width: 840px) {
  .benchmark-review__workspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(11rem, 38%) minmax(0, 1fr);
  }

  .benchmark-review__cases {
    border-inline-end: 0;
    border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  }

  .benchmark-review__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
