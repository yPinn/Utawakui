<script setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { Search } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';
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

const props = defineProps({
  active: { type: Boolean, default: true },
  providerId: { type: String, default: 'lrclib' },
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
watch(
  () => props.active,
  async (active) => {
    if (!active) return;
    await nextTick();
    if (props.active) titleInputRef.value?.focus();
  },
);
onUnmounted(clearCandidateSearch);

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
const canBroaden = computed(
  () =>
    hasSearched.value &&
    !isSearchPending.value &&
    (activeMode.value === 'structured' ||
      (state.candidateSearch.providerStatuses || []).some(
        (status) => status.status === 'error' || status.partial === true,
      )) &&
    state.candidateSearch.status === 'ok' &&
    !state.candidateSearch.error &&
    !draftDiffersFromResults.value,
);
const draftDiffersFromResults = computed(() => {
  if (!submittedQuery.value || !hasSearched.value) return false;
  return (
    titleDraft.value.trim() !== submittedQuery.value.title ||
    artistDraft.value.trim() !== submittedQuery.value.artist
  );
});
const searchIncomplete = computed(
  () =>
    Boolean(state.candidateSearch.error) ||
    state.candidateSearch.status === 'error' ||
    (state.candidateSearch.providerStatuses || []).some(
      (status) =>
        status.status === 'error' ||
        (status.partial === true &&
          !['cache-miss', 'not-found', 'low-confidence-match'].includes(
            status.reason,
          )),
    ),
);
const searchHint = computed(() => {
  if (state.manualSave.error) return '';
  if (draftDiffersFromResults.value)
    return t('lyricsAcquisition.queryChangedMessage');
  if (
    !isSearchPending.value &&
    hasResults.value &&
    state.candidateSearch.extensionFailed
  )
    return t('lyricsAcquisition.moreUnavailable');
  return '';
});
const workspaceNotice = computed(() => {
  if (state.manualSave.error)
    return {
      tone: state.manualSave.committed ? 'warning' : 'danger',
      message: state.manualSave.error,
    };
  if (searchHint.value || isSearchPending.value || hasResults.value)
    return null;
  return (hasSearched.value || state.candidateSearch.error) &&
    searchIncomplete.value
    ? {
        tone: 'warning',
        message:
          state.candidateSearch.error ||
          t('lyricsAcquisition.searchUnavailable'),
        actionLabel: t('lyricsAcquisition.retry'),
      }
    : null;
});
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
    ? t('lyricsAcquisition.resultsAnnouncement', {
        versions: resultCount.value,
        count: sourceResultCount.value,
      })
    : t('lyricsAcquisition.candidateAnnouncement', {
        count: sourceResultCount.value,
      });
});

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
  const append =
    mode === 'broaden' && hasSearched.value && !draftDiffersFromResults.value;
  const previousExpandedKey = expandedKey.value;
  if (!append) {
    remainingBestOpen.value = false;
    clearCandidateSearch();
  }
  try {
    activeMode.value = mode;
    submittedQuery.value = query;
    if (!append) changedCandidates.value = new Map();
    const result = await searchLyricsProviderCandidates(
      props.providerId,
      {
        query,
        ...(mode === 'broaden' ? { mode: 'broaden' } : {}),
      },
      trackContext.id,
    );
    if (!result) return;

    if (append) {
      const currentByKey = new Map(
        state.candidateSearch.candidates.map((candidate) => [
          candidateKey(candidate),
          candidate,
        ]),
      );
      changedCandidates.value = new Map(
        [...changedCandidates.value].filter(
          ([key, changed]) =>
            currentByKey.has(key) &&
            currentByKey.get(key).previewFingerprint !==
              changed.previewFingerprint,
        ),
      );
    }

    hasSearched.value = true;
    if (
      append &&
      state.candidateSearch.candidates.some(
        (candidate) => candidateKey(candidate) === previousExpandedKey,
      )
    ) {
      expandedKey.value = previousExpandedKey;
      remainingBestOpen.value =
        remainingBestGroups.value.length > 0 || remainingBestOpen.value;
    } else
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
  if (
    !candidate ||
    savingKey.value !== null ||
    isSearchPending.value ||
    !trackContext
  )
    return;
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
        :label="t('lyricsSource.search.title')"
        :aria-describedby="`${providerId}-query-help`"
        :maxlength="256"
        required
      />
      <UiTextField
        :id="`${providerId}-artist-name`"
        v-model="artistDraft"
        :label="t('lyricsSource.search.artist')"
        :aria-describedby="`${providerId}-query-help`"
        :maxlength="256"
      />
      <UiStack
        class="lyrics-lrclib-search__actions"
        :gap="2"
        align="center"
        justify="end"
        wrap
        role="group"
        :aria-label="t('lyricsSource.search.actions')"
      >
        <UiButton
          v-if="canBroaden"
          :disabled="isSearchDisabled"
          @click="handleSearch('broaden')"
        >
          {{ t('lyricsSource.search.broaden') }}
        </UiButton>
        <UiButton
          :icon="Search"
          variant="accent"
          type="submit"
          :loading="isSearchPending"
          :loading-label="t('lyricsSource.search.search')"
          :disabled="titleIsMissing || isSearchDisabled"
        >
          {{ t('lyricsSource.search.search') }}
        </UiButton>
      </UiStack>
      <UiHint
        :id="`${providerId}-query-help`"
        class="lyrics-lrclib-search__query-help"
        aria-live="polite"
      >
        {{ searchHint || t('lyricsSource.search.queryHelp') }}
      </UiHint>
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
        v-if="workspaceNotice"
        v-bind="workspaceNotice"
        compact
        @action="handleSearch(activeMode)"
      />
      <UiSurface
        v-if="isSearchPending && !hasResults"
        radius="lg"
        class="lyrics-lrclib-search__skeleton"
        role="status"
        :aria-label="t('lyricsSource.search.loading')"
      >
        <UiSkeleton
          v-for="index in 3"
          :key="index"
          :lines="3"
          pattern="staggered"
        />
      </UiSurface>

      <UiHint v-else-if="!hasSearched && !workspaceNotice" padded>{{
        t('lyricsAcquisition.searchStart')
      }}</UiHint>
      <UiHint
        v-else-if="!hasResults && !workspaceNotice && !searchHint"
        role="status"
        padded
      >
        {{ t('lyricsAcquisition.noResults') }}
      </UiHint>

      <template v-else-if="hasResults">
        <UiHint v-if="resultRecordingGroups.best.length === 0" padded>
          {{ t('lyricsSource.search.versionsHint') }}
        </UiHint>

        <section
          v-if="resultRecordingGroups.best.length"
          class="lyrics-lrclib-search__group"
          :aria-labelledby="`${providerId}-best-results`"
        >
          <h3 :id="`${providerId}-best-results`">
            {{ t('lyricsSource.search.best') }}
            <span>{{ resultRecordingGroups.best.length }}</span>
          </h3>
          <UiSurface tag="ul" radius="lg" class="lyrics-lrclib-search__list">
            <LyricsProviderRecordingGroup
              v-for="group in initialBestGroups"
              :key="group.recordingKey"
              :group="group"
              :expanded-key="expandedKey"
              :saving-key="savingKey"
              :save-disabled="savingKey !== null || isSearchPending"
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
            :label="
              t('lyricsSource.search.remaining', {
                count: remainingBestGroups.length,
              })
            "
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
                :save-disabled="savingKey !== null || isSearchPending"
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
            {{ t('lyricsSource.search.other') }}
            <span>{{ resultRecordingGroups.related.length }}</span>
          </h3>
          <UiSurface tag="ul" radius="lg" class="lyrics-lrclib-search__list">
            <LyricsProviderRecordingGroup
              v-for="group in resultRecordingGroups.related"
              :key="group.recordingKey"
              :group="group"
              :expanded-key="expandedKey"
              :saving-key="savingKey"
              :save-disabled="savingKey !== null || isSearchPending"
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
  --lyrics-lrclib-search-focus-safe-inset: var(--ui-focus-safe-inset);

  min-height: 0;
  min-inline-size: 0;
  container: lyrics-search / inline-size;
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
  gap: var(--ui-space-3);
  padding: var(--ui-space-2);
  flex: none;
}

.lyrics-lrclib-search__query-help {
  grid-column: 1 / -1;
  text-wrap: pretty;
}

.lyrics-lrclib-search__actions {
  min-width: 0;
}

.lyrics-lrclib-search__results {
  --ui-scroll-layout-padding-inline-end: var(--ui-space-2);
  --ui-scroll-layout-padding-block-end: var(--ui-space-2);

  min-height: 0;
  display: var(--lyrics-search-results-display, grid);
  grid-template-rows: minmax(0, 1fr);
}

.lyrics-lrclib-search__results :deep(.lyrics-lrclib-search__results-viewport) {
  block-size: auto;
  overflow: var(--lyrics-search-results-overflow, hidden auto);
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

@container lyrics-search (width < 38rem) {
  .lyrics-lrclib-search__form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .lyrics-lrclib-search__actions {
    grid-area: 2 / 2;
  }

  .lyrics-lrclib-search__query-help {
    grid-area: 2 / 1;
    align-self: center;
    font-size: var(--ui-type-caption-size);
  }
}

@container lyrics-search (width < 24rem) {
  .lyrics-lrclib-search__actions,
  .lyrics-lrclib-search__query-help {
    grid-area: auto / 1 / auto / -1;
  }
}

@container lyrics-search (width < 20rem) {
  .lyrics-lrclib-search__form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
