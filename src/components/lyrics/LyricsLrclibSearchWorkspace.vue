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
import { useFeedbackReport } from '../../composables/useFeedbackReport.js';
import { buildLyricsIssueReport } from '../../utils/lyricsIssueReport.js';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiStack from '../ui/UiStack.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiTextField from '../ui/UiTextField.vue';
import LyricsProviderRecordingGroup from './LyricsProviderRecordingGroup.vue';

const emit = defineEmits(['back']);
const props = defineProps({
  providerId: { type: String, default: 'lrclib' },
  providerLabel: { type: String, default: 'LRCLIB' },
});

const lyrics = useLyrics();
const feedback = useFeedbackReport();
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
const remainingBestOpen = shallowRef(false);
const INITIAL_BEST_RECORDING_COUNT = 3;
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
const initialBestGroups = computed(() =>
  resultRecordingGroups.value.best.slice(0, INITIAL_BEST_RECORDING_COUNT),
);
const remainingBestGroups = computed(() =>
  resultRecordingGroups.value.best.slice(INITIAL_BEST_RECORDING_COUNT),
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
const partialResultsMessage = computed(() => {
  const details = [...providerFailureMessages.value];
  const invalidCount = state.candidateSearch.invalidRecordCount || 0;
  if (invalidCount > 0) {
    details.push(
      `${providerFailureMessages.value.length ? '另有 ' : ''}${invalidCount} 筆結果缺少必要資料`,
    );
  }
  return details.length
    ? `${details.join('；')}。已載入的結果仍可檢視與儲存。`
    : '';
});
const showPartialResultsWarning = computed(
  () =>
    hasResults.value &&
    !state.candidateSearch.error &&
    partialResultsMessage.value.length > 0,
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
    ? `找到 ${resultCount.value} 個版本、${sourceResultCount.value} 個歌詞來源`
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
  remainingBestOpen.value = false;
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

function reportCandidate(candidate) {
  if (!trackContext || savingKey.value !== null) return;
  feedback.openReport(
    buildLyricsIssueReport({
      track: trackContext,
      candidate: {
        ...candidate,
        providerId: candidate.providerId || props.providerId,
      },
    }),
  );
}
</script>

<template>
  <div class="lyrics-lrclib-search">
    <UiSurface
      tag="form"
      tone="surface"
      radius="lg"
      class="lyrics-lrclib-search__form"
      @submit.prevent="handleSearch()"
    >
      <UiTextField
        :id="`${providerId}-track-title`"
        ref="titleInput"
        v-model="titleDraft"
        label="歌曲名稱"
        :aria-describedby="`${providerId}-query-help`"
        :maxlength="256"
        required
      />
      <UiTextField
        :id="`${providerId}-artist-name`"
        v-model="artistDraft"
        label="演唱者（選填）"
        :aria-describedby="`${providerId}-query-help`"
        :maxlength="256"
      />
      <UiStack
        class="lyrics-lrclib-search__actions"
        :gap="2"
        align="center"
        justify="end"
        role="group"
        aria-label="搜尋操作"
      >
        <UiButton
          class="lyrics-lrclib-search__broaden"
          :class="{ 'lyrics-lrclib-search__broaden--hidden': !canBroaden }"
          :disabled="!canBroaden || isSearchDisabled"
          :aria-hidden="!canBroaden || undefined"
          @click="handleSearch('broaden')"
        >
          擴大搜尋
        </UiButton>
        <UiButton
          :icon="Search"
          variant="accent"
          type="submit"
          :loading="isSearchPending"
          loading-label="搜尋"
          :disabled="titleIsMissing || isSearchDisabled"
        >
          搜尋
        </UiButton>
      </UiStack>
      <p
        :id="`${providerId}-query-help`"
        class="lyrics-lrclib-search__query-help"
      >
        可輸入原文、羅馬字或常用譯名，只用於本次搜尋。
      </p>
    </UiSurface>

    <p v-if="resultAnnouncement" class="ui-visually-hidden" aria-live="polite">
      {{ resultAnnouncement }}
    </p>

    <UiScrollLayout
      class="lyrics-lrclib-search__results"
      axis="vertical"
      viewport-class="lyrics-lrclib-search__results-viewport"
      content-class="lyrics-lrclib-search__results-content"
    >
      <UiNotice
        v-if="draftDiffersFromResults"
        tone="info"
        title="搜尋條件已變更"
        message="再次搜尋即可使用新的歌曲名稱與演唱者。"
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
        v-if="showPartialResultsWarning"
        tone="warning"
        title="部分線上結果未載入"
        :message="partialResultsMessage"
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
      <UiSurface
        v-else-if="isSearchPending"
        radius="lg"
        class="lyrics-lrclib-search__skeleton"
        role="status"
        aria-label="正在載入候選歌詞"
      >
        <UiSkeleton
          v-for="index in 3"
          :key="index"
          :lines="3"
          pattern="staggered"
        />
      </UiSurface>

      <UiHint v-else-if="!hasSearched" padded>輸入歌名開始搜尋。</UiHint>
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
        title="沒有可用的歌詞結果"
        :message="`${state.candidateSearch.invalidRecordCount} 筆結果資料不完整，請調整搜尋條件後再試。`"
        compact
      />
      <UiHint v-else-if="!hasResults" role="status" padded>
        找不到歌詞。試試其他關鍵字。
      </UiHint>

      <template v-else>
        <UiHint v-if="resultRecordingGroups.best.length === 0" padded>
          以下可能是不同版本，請先確認。
        </UiHint>

        <section
          v-if="resultRecordingGroups.best.length"
          class="lyrics-lrclib-search__group"
          :aria-labelledby="`${providerId}-best-results`"
        >
          <h3 :id="`${providerId}-best-results`">
            較符合的錄音版本
            <span>{{ resultRecordingGroups.best.length }}</span>
          </h3>
          <UiSurface tag="ul" radius="lg" class="lyrics-lrclib-search__list">
            <LyricsProviderRecordingGroup
              v-for="group in initialBestGroups"
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
              @report="reportCandidate"
            />
          </UiSurface>
          <UiDisclosure
            v-if="remainingBestGroups.length"
            v-model:open="remainingBestOpen"
            :label="`其餘符合版本（${remainingBestGroups.length}）`"
            class="lyrics-lrclib-search__more"
          >
            <UiSurface
              v-if="remainingBestOpen"
              tag="ul"
              radius="lg"
              class="lyrics-lrclib-search__list"
            >
              <LyricsProviderRecordingGroup
                v-for="group in remainingBestGroups"
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
                @report="reportCandidate"
              />
            </UiSurface>
          </UiDisclosure>
        </section>

        <section
          v-if="resultRecordingGroups.related.length"
          class="lyrics-lrclib-search__group"
          :aria-labelledby="`${providerId}-related-results`"
        >
          <h3 :id="`${providerId}-related-results`">
            其他可能版本
            <span>{{ resultRecordingGroups.related.length }}</span>
          </h3>
          <UiSurface tag="ul" radius="lg" class="lyrics-lrclib-search__list">
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
              @report="reportCandidate"
            />
          </UiSurface>
        </section>
      </template>
    </UiScrollLayout>
  </div>
</template>

<style scoped>
.lyrics-lrclib-search {
  --lyrics-lrclib-search-focus-safe-inset: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );

  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  overflow: clip;
  overflow-clip-margin: var(--lyrics-lrclib-search-focus-safe-inset);
  -webkit-user-select: none;
  user-select: none;
}

.lyrics-lrclib-search__form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
  flex: none;
}

.lyrics-lrclib-search__query-help {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.lyrics-lrclib-search__actions {
  min-width: 0;
}

.lyrics-lrclib-search__broaden--hidden {
  visibility: hidden;
}

.lyrics-lrclib-search__results {
  --ui-scroll-layout-padding-inline-end: var(--ui-space-2);
  --ui-scroll-layout-padding-block-end: var(--ui-space-2);

  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
}

.lyrics-lrclib-search__results :deep(.lyrics-lrclib-search__results-viewport) {
  block-size: auto;
  overscroll-behavior: contain;
}

.lyrics-lrclib-search__results :deep(.lyrics-lrclib-search__results-content) {
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
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
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.lyrics-lrclib-search__group h3 span {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
}

.lyrics-lrclib-search__list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
}

.lyrics-lrclib-search__skeleton {
  overflow: hidden;
}

.lyrics-lrclib-search__skeleton :deep(.ui-skeleton) {
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-lrclib-search__skeleton :deep(.ui-skeleton:last-child) {
  border-bottom: 0;
}

@media (max-width: 680px) {
  .lyrics-lrclib-search__form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
