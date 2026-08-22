<script setup>
import { computed, ref } from 'vue';
import { Check, ChevronRight, Tag } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { formatDuration } from '../../utils/format.js';
import { formatLyricTime } from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';

const {
  state,
  selectedLyrics,
  ensureLyricsFlow,
  searchLyricsCandidates,
  saveLyricsCandidate,
  backfillSourceLabels,
} = useLyrics();

const hasUnlabeledLrclibSources = computed(() =>
  selectedLyrics.value.sources.some(
    (source) => source.kind === 'lrclib' && !source.label,
  ),
);

const isBackfilling = ref(false);

async function handleBackfill() {
  isBackfilling.value = true;
  try {
    await backfillSourceLabels();
  } finally {
    isBackfilling.value = false;
  }
}

const isSearchOpen = ref(false);

async function toggleSearch() {
  if (isSearchOpen.value) {
    isSearchOpen.value = false;
    return;
  }
  if (!(await ensureLyricsFlow())) return;
  isSearchOpen.value = true;
  await searchLyricsCandidates();
}

const candidateSavingId = ref(null);

async function handleSaveCandidate(candidateId) {
  candidateSavingId.value = candidateId;
  try {
    const result = await saveLyricsCandidate(candidateId);
    if (result) await searchLyricsCandidates();
  } finally {
    candidateSavingId.value = null;
  }
}

const CONFIDENCE_LABELS = {
  auto: '高信心',
  candidate: '候選',
  unscored: '未評分',
};
const CONFIDENCE_TONES = {
  auto: 'accent',
  candidate: 'info',
  unscored: 'muted',
};
const QUERY_SOURCE_LABELS = {
  metadata: 'metadata',
  'title-derived': '標題推測',
  'title-only': '僅標題',
};

function confidenceLabel(candidate) {
  return CONFIDENCE_LABELS[candidate.confidence] || candidate.confidence;
}

function confidenceTone(candidate) {
  return CONFIDENCE_TONES[candidate.confidence] || 'muted';
}

function querySourceLabel(candidate) {
  if (!candidate.querySource) return null;
  return QUERY_SOURCE_LABELS[candidate.querySource] || candidate.querySource;
}

function candidateSubtitle(candidate) {
  return [candidate.artistName, candidate.albumName].filter(Boolean).join('・');
}

function formatSignedDelta(delta) {
  if (delta === 0) return '0s';
  return delta > 0 ? `+${delta}s` : `${delta}s`;
}

function candidateSummaryLine(candidate) {
  const parts = [`${candidate.lineCount} 行`];
  if (Number.isFinite(candidate.duration)) {
    const delta = Number.isFinite(candidate.durationDeltaSigned)
      ? ` (${formatSignedDelta(candidate.durationDeltaSigned)})`
      : '';
    parts.push(`${formatDuration(candidate.duration)}${delta}`);
  }
  return parts.join(' / ');
}
</script>

<template>
  <section
    class="lyrics-lrclib-search-panel"
    aria-labelledby="lyrics-lrclib-search-title"
  >
    <div class="lyrics-lrclib-search-panel__header">
      <UiButton
        id="lyrics-lrclib-search-title"
        :icon="ChevronRight"
        class="lyrics-lrclib-search-panel__toggle"
        :class="{
          'lyrics-lrclib-search-panel__toggle--open': isSearchOpen,
        }"
        :aria-expanded="isSearchOpen"
        @click="toggleSearch"
      >
        搜尋 LRCLIB 候選
      </UiButton>

      <UiButton
        v-if="hasUnlabeledLrclibSources"
        :icon="Tag"
        :active="isBackfilling"
        title="為既有 LRCLIB 來源補上標籤"
        @click="handleBackfill"
      >
        補齊標籤
      </UiButton>
    </div>

    <div v-if="isSearchOpen" class="lyrics-lrclib-search-panel__body">
      <UiNotice
        v-if="state.candidateSearch.error"
        tone="danger"
        title="歌詞搜尋未完成"
        :message="state.candidateSearch.error"
        compact
      />
      <UiHint v-else-if="state.candidateSearch.isLoading" padded>
        搜尋中
      </UiHint>
      <UiHint v-else-if="state.candidateSearch.status === 'unavailable'" padded>
        找不到符合的歌詞：{{ state.candidateSearch.reason }}
      </UiHint>
      <UiNotice
        v-else-if="state.candidateSearch.status === 'error'"
        tone="danger"
        title="歌詞搜尋未完成"
        :message="state.candidateSearch.reason"
        compact
      />
      <UiHint v-else-if="state.candidateSearch.candidates.length === 0" padded>
        沒有找到候選歌詞。
      </UiHint>

      <ul v-else class="lyrics-lrclib-candidate-list">
        <li
          v-for="candidate in state.candidateSearch.candidates"
          :key="candidate.id"
          class="lyrics-lrclib-candidate-row"
        >
          <div class="lyrics-lrclib-candidate-row__header">
            <div class="lyrics-lrclib-candidate-row__info">
              <p class="lyrics-lrclib-candidate-row__title">
                {{ candidate.trackName }}
              </p>
              <p
                v-if="candidateSubtitle(candidate)"
                class="lyrics-lrclib-candidate-row__subtitle"
                :title="candidateSubtitle(candidate)"
              >
                {{ candidateSubtitle(candidate) }}
              </p>
            </div>
            <div class="lyrics-lrclib-candidate-row__summary">
              <span>{{ candidateSummaryLine(candidate) }}</span>
              <UiChip
                :tone="confidenceTone(candidate)"
                :title="
                  querySourceLabel(candidate)
                    ? `比對依據：${querySourceLabel(candidate)}`
                    : undefined
                "
              >
                {{ confidenceLabel(candidate) }}
              </UiChip>
            </div>
          </div>

          <div
            v-if="candidate.previewLines?.length > 0"
            class="lyrics-lrclib-candidate-preview"
          >
            <ol class="lyrics-lrclib-candidate-preview__lines">
              <li v-for="(line, index) in candidate.previewLines" :key="index">
                <span class="lyrics-lrclib-candidate-preview__time">{{
                  formatLyricTime(line.start)
                }}</span>
                <span>{{ line.text }}</span>
              </li>
            </ol>
          </div>

          <div class="lyrics-lrclib-candidate-row__footer">
            <UiButton
              v-if="candidate.alreadySaved"
              :icon="Check"
              disabled
              title="已保存"
            >
              已保存
            </UiButton>
            <UiButton
              v-else
              variant="accent"
              :disabled="candidateSavingId === candidate.id"
              @click="handleSaveCandidate(candidate.id)"
            >
              {{ candidateSavingId === candidate.id ? '保存中...' : '保存' }}
            </UiButton>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.lyrics-lrclib-search-panel {
  display: grid;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-lrclib-search-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

/* UiButton itself provides the reset/chrome/focus-ring; only the
   expand/collapse chevron rotation is specific to this caller. */
.lyrics-lrclib-search-panel__toggle :deep(svg) {
  transition: transform var(--ui-motion-fast) var(--ui-motion-ease);
}

.lyrics-lrclib-search-panel__toggle--open :deep(svg) {
  transform: rotate(90deg);
}

.lyrics-lrclib-search-panel__body {
  display: grid;
  gap: var(--ui-space-2);
}

.lyrics-lrclib-candidate-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 50vh;
  overflow-y: auto;
}

.lyrics-lrclib-candidate-row {
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.lyrics-lrclib-candidate-row__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.lyrics-lrclib-candidate-row__info {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.lyrics-lrclib-candidate-row__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-lrclib-candidate-row__subtitle {
  margin: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.lyrics-lrclib-candidate-row__summary {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.lyrics-lrclib-candidate-row__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-2);
}

.lyrics-lrclib-candidate-preview {
  margin-top: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
}

.lyrics-lrclib-candidate-preview__lines {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
}

.lyrics-lrclib-candidate-preview__lines li {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: var(--ui-space-2);
}

.lyrics-lrclib-candidate-preview__time {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
