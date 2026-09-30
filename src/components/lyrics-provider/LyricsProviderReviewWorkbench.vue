<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useLyricsProviderCorpusReview } from '../../composables/useLyricsProviderCorpusReview.js';
import { isEditableTarget } from '../../utils/dom.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import LyricsProviderReviewCandidateList from './LyricsProviderReviewCandidateList.vue';
import LyricsProviderReviewForm from './LyricsProviderReviewForm.vue';
import LyricsProviderReviewStrata from './LyricsProviderReviewStrata.vue';

const review = useLyricsProviderCorpusReview();
const rejectionReason = ref('');

const progressPercent = computed(() => {
  const counts = review.dataset.value?.counts;
  if (!counts?.total) return 0;
  return Math.round((counts.approved / counts.total) * 100);
});

async function approve() {
  if (await review.approveAndNext()) rejectionReason.value = '';
}

async function reject() {
  if (await review.rejectAndNext(rejectionReason.value)) {
    rejectionReason.value = '';
  }
}

function handleShortcut(event) {
  if (!event.ctrlKey || event.altKey || event.metaKey || review.saving.value) {
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    approve();
    return;
  }
  if (
    event.key === 'Backspace' &&
    !isEditableTarget(event.target) &&
    rejectionReason.value
  ) {
    event.preventDefault();
    reject();
  }
}

onMounted(review.load);
onMounted(() => window.addEventListener('keydown', handleShortcut));
onUnmounted(() => window.removeEventListener('keydown', handleShortcut));
</script>

<template>
  <section class="lyrics-review" aria-labelledby="lyrics-review-title">
    <header class="lyrics-review__header">
      <UiPageHeader title="歌詞語料審核" title-id="lyrics-review-title">
        <template #description>
          逐筆審核歌詞來源候選並核准或退回，完成後可匯出評估用 corpus。
        </template>
        <template #actions>
          <UiButton
            v-if="review.dataset.value"
            :variant="review.dataset.value.canExport ? 'accent' : 'ghost'"
            :disabled="
              review.exporting.value || !review.dataset.value.canExport
            "
            @click="review.exportCorpus"
          >
            {{ review.exporting.value ? '匯出中…' : '匯出 corpus' }}
          </UiButton>
          <UiChip tone="gated">內部工具 · F7</UiChip>
        </template>
      </UiPageHeader>
      <div v-if="review.dataset.value" class="lyrics-review__progress">
        <span>
          已核准 {{ review.dataset.value.counts.approved }} /
          {{ review.dataset.value.counts.total }}
        </span>
        <span
          class="lyrics-review__progress-track"
          role="progressbar"
          aria-label="整體審核進度"
          :aria-valuenow="review.dataset.value.counts.approved"
          aria-valuemin="0"
          :aria-valuemax="review.dataset.value.counts.total"
        >
          <span
            class="lyrics-review__progress-value"
            :style="{ width: `${progressPercent}%` }"
          />
        </span>
        <span
          v-if="review.dataset.value.counts.replacementNeeded"
          class="lyrics-review__replacement"
        >
          待替換 {{ review.dataset.value.counts.replacementNeeded }}
        </span>
      </div>
    </header>

    <UiNotice
      v-if="review.error.value"
      class="lyrics-review__notice"
      :notice="review.error.value"
      tone="danger"
      @action="review.load"
    />
    <UiNotice
      v-else-if="review.exported.value"
      class="lyrics-review__notice"
      tone="success"
      title="語料已匯出"
      message="固定 corpus 已寫入私有評估目錄。"
      compact
    />

    <div
      v-if="review.loading.value"
      class="lyrics-review__loading"
      role="status"
    >
      正在驗證候選與審核 manifest…
    </div>
    <div v-else-if="!review.dataset.value" class="lyrics-review__loading">
      <p>尚未載入私有歌詞候選資料。</p>
      <UiButton variant="accent" @click="review.load">重新讀取</UiButton>
    </div>
    <template v-else>
      <LyricsProviderReviewStrata
        :strata="review.dataset.value.strata"
        :selected-stratum-id="review.selectedStratumId.value"
        :decision-filter="review.decisionFilter.value"
        :reach-filter="review.reachFilter.value"
        :query="review.query.value"
        :disabled="review.saving.value"
        @update:selected-stratum-id="review.selectStratum"
        @update:decision-filter="review.setDecisionFilter"
        @update:reach-filter="review.setReachFilter"
        @update:query="review.setQuery"
      />

      <UiScrollRegion
        class="lyrics-review__workspace-scroll"
        axis="vertical"
        viewport-class="lyrics-review__workspace"
      >
        <LyricsProviderReviewCandidateList
          :candidates="review.visibleCandidates.value"
          :selected-candidate-id="review.selectedCandidateId.value"
          :saving="review.saving.value"
          @select="review.selectCandidate"
        />
        <LyricsProviderReviewForm
          v-if="review.selectedCandidate.value"
          :candidate="review.selectedCandidate.value"
          :model-value="review.draft"
          :rejection-reason="rejectionReason"
          :saving="review.saving.value"
          :approval-blocker="review.approvalBlocker.value"
          :approval-field="review.approvalField.value"
          @update:model-value="Object.assign(review.draft, $event)"
          @update:rejection-reason="rejectionReason = $event"
          @approve="approve"
          @reject="reject"
        />
        <div
          v-else
          class="lyrics-review__no-selection"
          role="status"
          aria-live="polite"
        >
          目前篩選條件沒有可審核項目。切換狀態或曲庫篩選以檢視其他候選。
        </div>
      </UiScrollRegion>
    </template>
  </section>
</template>

<style scoped>
.lyrics-review {
  container-type: inline-size;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  -webkit-user-select: none;
  user-select: none;
}

.lyrics-review__header {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
}

.lyrics-review__header :deep(.ui-page-header) {
  margin-bottom: 0;
}

.lyrics-review__progress {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.lyrics-review__progress,
.lyrics-review__replacement {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.lyrics-review__progress-track {
  width: clamp(8rem, 18vw, 18rem);
  height: var(--ui-space-1);
  overflow: hidden;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-surface-raised);
}

.lyrics-review__progress-value {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ui-color-accent);
  transition: width var(--ui-motion-slow) var(--ui-motion-ease);
}

.lyrics-review__replacement {
  color: var(--ui-color-danger);
}

.lyrics-review__notice {
  margin: var(--ui-space-2) var(--ui-space-3) 0;
}

.lyrics-review__loading,
.lyrics-review__no-selection {
  min-height: 12rem;
  display: grid;
  place-items: center;
  align-content: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  text-align: center;
}

.lyrics-review__loading p {
  margin: 0;
}

.lyrics-review__workspace-scroll {
  min-width: 0;
  min-height: 0;
}

.lyrics-review__workspace-scroll :deep(.lyrics-review__workspace) {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(18rem, 38%) minmax(24rem, 1fr);
}

@container (max-width: 900px) {
  .lyrics-review__title-block,
  .lyrics-review__progress {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--ui-space-1);
  }

  .lyrics-review__workspace-scroll :deep(.lyrics-review__workspace) {
    min-height: 56rem;
    grid-template-columns: 1fr;
    grid-template-rows: minmax(16rem, 35vh) minmax(40rem, auto);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lyrics-review__progress-value {
    transition: none;
  }
}
</style>
