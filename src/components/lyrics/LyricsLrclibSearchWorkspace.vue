<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import { Search } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import LyricsLrclibCandidateRow from './LyricsLrclibCandidateRow.vue';

const emit = defineEmits(['back']);

const {
  state,
  selectedTrack,
  clearCandidateSearch,
  searchLyricsCandidates,
  saveLyricsCandidate,
} = useLyrics();

const trackContext = selectedTrack.value;
const titleDraft = ref(trackContext?.title || '');
const artistDraft = ref(trackContext?.artist || '');
const submittedQuery = ref(null);
const activeMode = ref('structured');
const hasSearched = ref(false);
const expandedId = ref(null);
const savingId = ref(null);
const submissionPending = ref(false);
const changedCandidates = ref(new Map());
const titleInputRef = useTemplateRef('titleInput');

onMounted(() => {
  titleInputRef.value?.focus();
  void handleSearch();
});
onUnmounted(clearCandidateSearch);

watch(
  () => selectedTrack.value?.id,
  (trackId) => {
    if (trackId !== trackContext?.id) emit('back');
  },
);

const titleIsMissing = computed(() => !titleDraft.value.trim());
const isSearchPending = computed(
  () => submissionPending.value || state.candidateSearch.isLoading,
);
const isSearchDisabled = computed(
  () => isSearchPending.value || savingId.value !== null,
);
const resultCount = computed(() => state.candidateSearch.candidates.length);
const hasResults = computed(() => resultCount.value > 0);
const canBroaden = computed(
  () =>
    hasSearched.value &&
    !isSearchPending.value &&
    activeMode.value === 'structured' &&
    state.candidateSearch.status === 'ok' &&
    !state.candidateSearch.error &&
    state.candidateSearch.groups.best.length === 0 &&
    !draftDiffersFromResults.value,
);
const draftDiffersFromResults = computed(() => {
  if (!submittedQuery.value || !hasSearched.value) return false;
  return (
    titleDraft.value.trim() !== submittedQuery.value.title ||
    artistDraft.value.trim() !== submittedQuery.value.artist
  );
});
const resultAnnouncement = computed(() => {
  if (isSearchPending.value) return '正在搜尋 LRCLIB';
  if (!hasSearched.value) {
    return titleIsMissing.value ? '請輸入歌曲名稱後搜尋' : '準備搜尋';
  }
  if (state.candidateSearch.error) return '搜尋未完成';
  return `找到 ${resultCount.value} 筆候選歌詞`;
});

function changedCandidate(candidateId) {
  return changedCandidates.value.get(candidateId) || null;
}

function setChangedCandidate(candidateId, candidate) {
  const next = new Map(changedCandidates.value);
  if (candidate) next.set(candidateId, candidate);
  else next.delete(candidateId);
  changedCandidates.value = next;
}

async function handleSearch(mode = 'structured') {
  if (isSearchDisabled.value || !trackContext) return;
  const query = {
    title: titleDraft.value.trim(),
    artist: artistDraft.value.trim(),
  };
  if (!query.title) return;

  submissionPending.value = true;
  clearCandidateSearch();
  try {
    activeMode.value = mode;
    submittedQuery.value = query;
    changedCandidates.value = new Map();
    const result = await searchLyricsCandidates(
      {
        query,
        ...(mode === 'broaden' ? { mode: 'broaden' } : {}),
      },
      trackContext.id,
    );
    if (!result) return;

    hasSearched.value = true;
    expandedId.value = result.candidates?.[0]?.id ?? null;
  } finally {
    submissionPending.value = false;
  }
}

async function handleSave(candidate) {
  if (savingId.value !== null || !trackContext) return;
  savingId.value = candidate.id;
  try {
    const result = await saveLyricsCandidate(
      candidate,
      trackContext.id,
      submittedQuery.value,
    );
    if (result?.status === 'record-changed' && result.candidate) {
      setChangedCandidate(candidate.id, result.candidate);
      expandedId.value = candidate.id;
    } else if (result?.status === 'saved') {
      setChangedCandidate(candidate.id, null);
    }
  } finally {
    savingId.value = null;
  }
}

function toggleCandidate(candidateId) {
  expandedId.value = expandedId.value === candidateId ? null : candidateId;
}
</script>

<template>
  <div class="lyrics-lrclib-search">
    <div class="lyrics-lrclib-search__toolbar">
      <UiButton @click="emit('back')">返回來源管理</UiButton>
      <p>只搜尋，不會修改曲目資訊。</p>
    </div>

    <form class="lyrics-lrclib-search__form" @submit.prevent="handleSearch()">
      <UiTextField
        id="lrclib-track-title"
        ref="titleInput"
        v-model="titleDraft"
        label="歌曲名稱"
        :maxlength="256"
        required
      />
      <UiTextField
        id="lrclib-artist-name"
        v-model="artistDraft"
        label="歌手"
        :maxlength="256"
      />
      <UiButton
        :icon="Search"
        variant="accent"
        type="submit"
        :disabled="titleIsMissing || isSearchDisabled"
      >
        {{ isSearchPending ? '搜尋中…' : '搜尋' }}
      </UiButton>
    </form>

    <div class="lyrics-lrclib-search__result-meta">
      <p aria-live="polite">{{ resultAnnouncement }}</p>
      <UiButton
        v-if="canBroaden"
        :disabled="isSearchDisabled"
        @click="handleSearch('broaden')"
      >
        擴大搜尋
      </UiButton>
    </div>

    <div class="lyrics-lrclib-search__results">
      <UiNotice
        v-if="draftDiffersFromResults"
        tone="info"
        title="目前顯示上次查詢結果"
        message="再次按下搜尋，才會使用剛修改的曲名與歌手。"
        compact
      />
      <UiNotice
        v-if="state.manualSave.error"
        tone="danger"
        title="歌詞未儲存"
        :message="state.manualSave.error"
        compact
      />
      <UiNotice
        v-if="state.candidateSearch.error"
        tone="danger"
        title="歌詞搜尋未完成"
        :message="state.candidateSearch.error"
        action-label="重試"
        compact
        @action="handleSearch(activeMode)"
      />
      <div
        v-else-if="isSearchPending"
        class="lyrics-lrclib-search__skeleton"
        role="status"
        aria-label="正在載入候選歌詞"
      >
        <div v-for="index in 3" :key="index" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
      </div>

      <UiHint v-else-if="!hasSearched" padded>
        請輸入歌曲名稱後搜尋。輸入期間不會自動送出。
      </UiHint>
      <UiHint v-else-if="state.candidateSearch.status === 'unavailable'" padded>
        目前找不到可用的候選歌詞。你可以調整查詢，或嘗試擴大搜尋。
      </UiHint>
      <UiNotice
        v-else-if="state.candidateSearch.invalidRecordCount > 0 && !hasResults"
        tone="warning"
        title="沒有可安全顯示的候選"
        :message="`${state.candidateSearch.invalidRecordCount} 筆來源資料不完整，已安全略過。請調整查詢後再試。`"
        compact
      />
      <UiHint v-else-if="!hasResults" padded>
        沒有找到候選歌詞。請檢查曲名與歌手，或嘗試擴大搜尋。
      </UiHint>

      <template v-else>
        <UiNotice
          v-if="state.candidateSearch.invalidRecordCount > 0"
          tone="warning"
          title="部分候選未顯示"
          :message="`${state.candidateSearch.invalidRecordCount} 筆來源資料不完整，已安全略過。`"
          compact
        />
        <UiHint v-if="state.candidateSearch.groups.best.length === 0" padded>
          沒有高度符合的結果；以下相近結果可能是不同版本，請先確認。
        </UiHint>

        <section
          v-if="state.candidateSearch.groups.best.length"
          class="lyrics-lrclib-search__group"
          aria-labelledby="lrclib-best-results"
        >
          <h3 id="lrclib-best-results">
            最佳符合
            <span>{{ state.candidateSearch.groups.best.length }}</span>
          </h3>
          <ul class="lyrics-lrclib-search__list">
            <LyricsLrclibCandidateRow
              v-for="candidate in state.candidateSearch.groups.best"
              :key="candidate.id"
              :candidate="candidate"
              :expanded="expandedId === candidate.id"
              :saving="savingId === candidate.id"
              :save-disabled="savingId !== null"
              :changed-candidate="changedCandidate(candidate.id)"
              @toggle="toggleCandidate(candidate.id)"
              @save="handleSave(candidate)"
              @confirm-changed="handleSave(changedCandidate(candidate.id))"
              @cancel-changed="setChangedCandidate(candidate.id, null)"
            />
          </ul>
        </section>

        <section
          v-if="state.candidateSearch.groups.related.length"
          class="lyrics-lrclib-search__group"
          aria-labelledby="lrclib-related-results"
        >
          <h3 id="lrclib-related-results">
            相近結果
            <span>{{ state.candidateSearch.groups.related.length }}</span>
          </h3>
          <ul class="lyrics-lrclib-search__list">
            <LyricsLrclibCandidateRow
              v-for="candidate in state.candidateSearch.groups.related"
              :key="candidate.id"
              :candidate="candidate"
              :expanded="expandedId === candidate.id"
              :saving="savingId === candidate.id"
              :save-disabled="savingId !== null"
              :changed-candidate="changedCandidate(candidate.id)"
              @toggle="toggleCandidate(candidate.id)"
              @save="handleSave(candidate)"
              @confirm-changed="handleSave(changedCandidate(candidate.id))"
              @cancel-changed="setChangedCandidate(candidate.id, null)"
            />
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.lyrics-lrclib-search {
  max-height: calc(100vh - var(--ui-space-8) - var(--ui-space-8));
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: var(--ui-space-3);
  overflow: hidden;
  -webkit-user-select: none;
  user-select: none;
}

.lyrics-lrclib-search__toolbar,
.lyrics-lrclib-search__result-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.lyrics-lrclib-search__toolbar p,
.lyrics-lrclib-search__result-meta p {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-lrclib-search__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-canvas);
}

.lyrics-lrclib-search__results {
  min-height: calc(var(--ui-space-8) + var(--ui-space-8) + var(--ui-space-8));
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: var(--ui-space-1);
}

.lyrics-lrclib-search__group {
  display: grid;
  gap: var(--ui-space-2);
}

.lyrics-lrclib-search__group h3 {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.lyrics-lrclib-search__group h3 span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
}

.lyrics-lrclib-search__list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
  list-style: none;
}

.lyrics-lrclib-search__skeleton {
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
}

.lyrics-lrclib-search__skeleton > div {
  display: grid;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-lrclib-search__skeleton > div:last-child {
  border-bottom: 0;
}

.lyrics-lrclib-search__skeleton span {
  width: 70%;
  height: var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface-hover);
}

.lyrics-lrclib-search__skeleton span:nth-child(2) {
  width: 45%;
}

.lyrics-lrclib-search__skeleton span:nth-child(3) {
  width: 85%;
}

@media (max-width: 680px) {
  .lyrics-lrclib-search__form {
    grid-template-columns: minmax(0, 1fr);
  }

  .lyrics-lrclib-search__toolbar,
  .lyrics-lrclib-search__result-meta {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
