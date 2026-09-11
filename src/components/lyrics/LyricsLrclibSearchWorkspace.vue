<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Search } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import LyricsProviderRecordingGroup from './LyricsProviderRecordingGroup.vue';

const emit = defineEmits(['back']);
const props = defineProps({
  providerId: { type: String, default: 'lrclib' },
  providerLabel: { type: String, default: 'LRCLIB' },
});

const lyrics = useLyrics();
const { state, selectedTrack, clearCandidateSearch } = lyrics;
const searchLyricsProviderCandidates =
  lyrics.searchLyricsProviderCandidates ||
  ((_providerId, options, trackId) =>
    lyrics.searchLyricsCandidates(options, trackId));
const saveLyricsProviderCandidate =
  lyrics.saveLyricsProviderCandidate ||
  ((_providerId, candidate, trackId, query) =>
    lyrics.saveLyricsCandidate(candidate, trackId, query));

const trackContext = selectedTrack.value;
const titleDraft = shallowRef(trackContext?.title || '');
const artistDraft = shallowRef(trackContext?.artist || '');
const submittedQuery = shallowRef(null);
const activeMode = shallowRef('structured');
const hasSearched = shallowRef(false);
const expandedKey = shallowRef(null);
const savingKey = shallowRef(null);
const submissionPending = shallowRef(false);
const changedCandidates = shallowRef(new Map());
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
  () => isSearchPending.value || savingKey.value !== null,
);
const resultRecordingGroups = computed(() => {
  const recordingGroups = state.candidateSearch.recordingGroups;
  if (
    recordingGroups &&
    (recordingGroups.best?.length || recordingGroups.related?.length)
  ) {
    return recordingGroups;
  }
  function singleCandidateGroup(candidate) {
    const key = candidateKey(candidate);
    return {
      recordingKey: `candidate:${key}`,
      matchBand: candidate.matchBand,
      recommendedCandidateKey: key,
      candidates: [{ ...candidate, candidateKey: key }],
    };
  }
  return {
    best: (state.candidateSearch.groups.best || []).map(singleCandidateGroup),
    related: (state.candidateSearch.groups.related || []).map(
      singleCandidateGroup,
    ),
  };
});
const resultCount = computed(
  () =>
    resultRecordingGroups.value.best.length +
    resultRecordingGroups.value.related.length,
);
const sourceResultCount = computed(
  () => state.candidateSearch.candidates.length,
);
const hasResults = computed(() => sourceResultCount.value > 0);
const SILENT_PROVIDER_MISS_REASONS = new Set([
  'cache-miss',
  'not-found',
  'low-confidence-match',
]);
const silentProviderMiss = computed(
  () =>
    props.providerId === 'betterlyrics' &&
    state.candidateSearch.status === 'unavailable' &&
    SILENT_PROVIDER_MISS_REASONS.has(state.candidateSearch.reason) &&
    !hasResults.value &&
    !state.candidateSearch.error,
);
const canBroaden = computed(
  () =>
    hasSearched.value &&
    !isSearchPending.value &&
    activeMode.value === 'structured' &&
    state.candidateSearch.status === 'ok' &&
    !state.candidateSearch.error &&
    providerFailureMessages.value.length === 0 &&
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
const providerFailureMessages = computed(() =>
  (state.candidateSearch.providerStatuses || [])
    .filter((providerStatus) => providerStatus.status === 'error')
    .map(providerFailureMessage),
);
const showPartialProviderWarning = computed(
  () =>
    hasResults.value &&
    !state.candidateSearch.error &&
    providerFailureMessages.value.length > 0,
);
const showProviderFailureWithoutResults = computed(
  () =>
    hasSearched.value &&
    !hasResults.value &&
    !state.candidateSearch.error &&
    providerFailureMessages.value.length > 0,
);
const resultAnnouncement = computed(() => {
  if (
    isSearchPending.value ||
    !hasSearched.value ||
    !hasResults.value ||
    state.candidateSearch.error
  ) {
    return '';
  }
  return props.providerId === 'all'
    ? `找到 ${resultCount.value} 個錄音版本、${sourceResultCount.value} 個歌詞來源`
    : `找到 ${sourceResultCount.value} 筆候選歌詞`;
});

function providerNameFor(providerId) {
  if (providerId === 'betterlyrics') return 'Better Lyrics';
  if (providerId === 'netease') return '網易雲音樂';
  if (providerId === 'lrclib') return 'LRCLIB';
  return '線上來源';
}

function providerFailureMessage(providerStatus) {
  const providerName = providerNameFor(providerStatus.provider);
  if (providerStatus.reason === 'timeout') return `${providerName} 回應逾時`;
  if (providerStatus.reason === 'offline') return `${providerName} 無法連線`;
  if (providerStatus.reason === 'rate-limited') {
    return `${providerName} 暫時限制請求`;
  }
  if (providerStatus.reason === 'service-unavailable') {
    return `${providerName} 服務暫時無法使用`;
  }
  return `${providerName} 搜尋失敗`;
}

function candidateKey(candidate) {
  return (
    candidate?.candidateKey ||
    `${candidate?.providerId || props.providerId}:${candidate?.id}`
  );
}

function setChangedCandidate(candidate, changedCandidate) {
  const next = new Map(changedCandidates.value);
  const key = candidateKey(candidate);
  if (changedCandidate) {
    next.set(key, {
      ...changedCandidate,
      providerId: candidate.providerId || props.providerId,
      candidateKey: key,
    });
  } else next.delete(key);
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
    const result = await searchLyricsProviderCandidates(
      props.providerId,
      {
        query,
        ...(mode === 'broaden' ? { mode: 'broaden' } : {}),
      },
      trackContext.id,
    );
    if (!result) return;

    hasSearched.value = true;
    expandedKey.value =
      state.candidateSearch.recordingGroups?.best?.[0]
        ?.recommendedCandidateKey ||
      state.candidateSearch.recordingGroups?.related?.[0]
        ?.recommendedCandidateKey ||
      (result.candidates?.[0] ? candidateKey(result.candidates[0]) : null);
  } finally {
    submissionPending.value = false;
  }
}

async function handleSave(candidate) {
  if (!candidate || savingKey.value !== null || !trackContext) return;
  const key = candidateKey(candidate);
  const candidateProviderId = candidate.providerId || props.providerId;
  const candidateForSave =
    props.providerId === 'all'
      ? candidate
      : Object.fromEntries(
          Object.entries(candidate).filter(
            ([field]) => !['candidateKey', 'providerId'].includes(field),
          ),
        );
  savingKey.value = key;
  try {
    const result = await saveLyricsProviderCandidate(
      candidateProviderId,
      candidateForSave,
      trackContext.id,
      submittedQuery.value,
    );
    if (result?.status === 'record-changed' && result.candidate) {
      setChangedCandidate(candidate, result.candidate);
      expandedKey.value = key;
    } else if (result?.status === 'saved') {
      setChangedCandidate(candidate, null);
    }
  } finally {
    savingKey.value = null;
  }
}

function toggleCandidate(candidate) {
  const key = candidateKey(candidate);
  expandedKey.value = expandedKey.value === key ? null : key;
}
</script>

<template>
  <div class="lyrics-lrclib-search">
    <div class="lyrics-lrclib-search__toolbar">
      <UiButton @click="emit('back')">返回來源管理</UiButton>
    </div>

    <form class="lyrics-lrclib-search__form" @submit.prevent="handleSearch()">
      <UiTextField
        :id="`${providerId}-track-title`"
        ref="titleInput"
        v-model="titleDraft"
        label="歌曲名稱"
        :maxlength="256"
        required
      />
      <UiTextField
        :id="`${providerId}-artist-name`"
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
      <p v-if="resultAnnouncement" class="visually-hidden" aria-live="polite">
        {{ resultAnnouncement }}
      </p>
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
        v-if="showPartialProviderWarning"
        tone="warning"
        title="部分來源未完成"
        :message="`${providerFailureMessages.join('；')}；目前顯示的其他來源仍可使用。`"
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
      <template v-else-if="silentProviderMiss">
        <!-- A normal Better Lyrics miss is intentionally silent. -->
      </template>
      <UiNotice
        v-else-if="showProviderFailureWithoutResults"
        tone="warning"
        title="歌詞搜尋未完成"
        :message="`${providerFailureMessages.join('；')}。請稍後重試。`"
        action-label="重試"
        compact
        @action="handleSearch(activeMode)"
      />
      <UiNotice
        v-else-if="state.candidateSearch.invalidRecordCount > 0 && !hasResults"
        tone="warning"
        title="沒有可安全顯示的候選"
        :message="`${state.candidateSearch.invalidRecordCount} 筆來源資料不完整，已安全略過。請調整查詢後再試。`"
        compact
      />
      <UiHint v-else-if="!hasResults" role="status" padded>
        沒有找到候選歌詞。
      </UiHint>

      <template v-else>
        <UiNotice
          v-if="state.candidateSearch.invalidRecordCount > 0"
          tone="warning"
          title="部分候選未顯示"
          :message="`${state.candidateSearch.invalidRecordCount} 筆來源資料不完整，已安全略過。`"
          compact
        />
        <UiHint v-if="resultRecordingGroups.best.length === 0" padded>
          沒有高度符合的結果；以下相近結果可能是不同版本，請先確認。
        </UiHint>

        <section
          v-if="resultRecordingGroups.best.length"
          class="lyrics-lrclib-search__group"
          :aria-labelledby="`${providerId}-best-results`"
        >
          <h3 :id="`${providerId}-best-results`">
            最佳符合
            <span>{{ resultRecordingGroups.best.length }}</span>
          </h3>
          <ul class="lyrics-lrclib-search__list">
            <LyricsProviderRecordingGroup
              v-for="group in resultRecordingGroups.best"
              :key="group.recordingKey"
              :group="group"
              :expanded-key="expandedKey"
              :saving-key="savingKey"
              :save-disabled="savingKey !== null"
              :changed-candidates="changedCandidates"
              :show-provider="providerId === 'all'"
              @toggle="toggleCandidate"
              @save="handleSave"
              @confirm-changed="handleSave"
              @cancel-changed="setChangedCandidate($event, null)"
            />
          </ul>
        </section>

        <section
          v-if="resultRecordingGroups.related.length"
          class="lyrics-lrclib-search__group"
          :aria-labelledby="`${providerId}-related-results`"
        >
          <h3 :id="`${providerId}-related-results`">
            相近結果
            <span>{{ resultRecordingGroups.related.length }}</span>
          </h3>
          <ul class="lyrics-lrclib-search__list">
            <LyricsProviderRecordingGroup
              v-for="group in resultRecordingGroups.related"
              :key="group.recordingKey"
              :group="group"
              :expanded-key="expandedKey"
              :saving-key="savingKey"
              :save-disabled="savingKey !== null"
              :changed-candidates="changedCandidates"
              :show-provider="providerId === 'all'"
              @toggle="toggleCandidate"
              @save="handleSave"
              @confirm-changed="handleSave"
              @cancel-changed="setChangedCandidate($event, null)"
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

.lyrics-lrclib-search__toolbar {
  display: flex;
  align-items: center;
}

.lyrics-lrclib-search__result-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.lyrics-lrclib-search__result-meta p {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.lyrics-lrclib-search__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
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

  .lyrics-lrclib-search__result-meta {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
