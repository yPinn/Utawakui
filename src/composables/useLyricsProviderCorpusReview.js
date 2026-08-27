import { computed, reactive, readonly, ref } from 'vue';

const MAX_TEXT_LENGTH = 256;
const PUBLIC_LOAD_ERROR = Object.freeze({
  title: '審核資料無法開啟',
  message: '請確認私有候選與審核檔案已準備完成，再重試。',
  actionLabel: '重新讀取',
});
const PUBLIC_SAVE_ERROR = Object.freeze({
  title: '審核決定未能儲存',
  message: '原始審核資料未變更，請重試。',
  actionLabel: '',
});
const PUBLIC_EXPORT_ERROR = Object.freeze({
  title: '語料尚未匯出',
  message: '所有候選都必須核准，且不能留有待替換項目。',
  actionLabel: '',
});
const REJECTION_REASONS = new Set([
  'language-mismatch',
  'genre-mismatch',
  'credit-mismatch',
  'version-ambiguous',
  'metadata-insufficient',
  'duplicate-recording',
  'release-before-2010',
  'other',
]);
const DECISION_FILTERS = new Set(['all', 'pending', 'approved', 'rejected']);
const REACH_FILTERS = new Set(['all', 'mainstream', 'long-tail']);

function emptyDraft() {
  return {
    title: '',
    artist: '',
    album: '',
    durationSeconds: 0,
    languageTag: 'mandarin',
    version: 'studio',
    eraTag: null,
    versionTrap: false,
  };
}

function draftFor(candidate) {
  const source = candidate?.confirmation ?? candidate?.reference;
  if (!source) return emptyDraft();
  return {
    title: source.title,
    artist: source.artist,
    album: source.album ?? '',
    durationSeconds: source.durationSeconds,
    languageTag: source.languageTag ?? candidate.languageTag,
    version: source.version ?? 'studio',
    eraTag: source.eraTag ?? null,
    versionTrap: source.versionTrap ?? false,
  };
}

function normalizedQuery(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase();
}

export function useLyricsProviderCorpusReview(
  bridge = typeof window === 'undefined' ? null : window.Utawakui,
) {
  const dataset = ref(null);
  const loading = ref(false);
  const saving = ref(false);
  const exporting = ref(false);
  const exported = ref(false);
  const error = ref(null);
  const selectedStratumId = ref(null);
  const selectedCandidateId = ref(null);
  const decisionFilter = ref('pending');
  const reachFilter = ref('all');
  const query = ref('');
  const draft = reactive(emptyDraft());

  const selectedCandidate = computed(
    () =>
      dataset.value?.candidates.find(
        (candidate) => candidate.id === selectedCandidateId.value,
      ) ?? null,
  );
  const selectedStratum = computed(
    () =>
      dataset.value?.strata.find(
        (stratum) => stratum.id === selectedStratumId.value,
      ) ?? null,
  );
  const visibleCandidates = computed(() => {
    const search = normalizedQuery(query.value);
    return (dataset.value?.candidates ?? []).filter((candidate) => {
      if (candidate.stratum !== selectedStratumId.value) return false;
      if (
        decisionFilter.value !== 'all' &&
        candidate.decision !== decisionFilter.value
      ) {
        return false;
      }
      if (
        reachFilter.value !== 'all' &&
        candidate.catalogReach !== reachFilter.value
      ) {
        return false;
      }
      if (!search) return true;
      const haystack =
        `${candidate.reference.title}\n${candidate.reference.artist}\n${candidate.id}\n${candidate.evidence.recordingMbid}`.toLocaleLowerCase();
      return haystack.includes(search);
    });
  });
  const approvalIssue = computed(() => {
    if (!selectedCandidate.value) {
      return { field: '', message: '請先選擇候選歌曲。' };
    }
    if (!draft.title.trim()) {
      return { field: 'title', message: '請確認歌名。' };
    }
    if (!draft.artist.trim()) {
      return { field: 'artist', message: '請確認歌手。' };
    }

    const durationSeconds = Number(draft.durationSeconds);
    if (
      !Number.isSafeInteger(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > 86_400
    ) {
      return {
        field: 'durationSeconds',
        message: '請確認有效的時長（1–86400 秒）。',
      };
    }
    if (!draft.languageTag) {
      return { field: 'languageTag', message: '請確認語言。' };
    }
    if (!draft.version) {
      return { field: 'version', message: '請確認版本。' };
    }
    if (draft.eraTag !== 'recent-release') {
      return {
        field: 'eraTag',
        message: '請先確認這筆錄音於 2010 年或之後首次發行。',
      };
    }
    return null;
  });
  const approvalBlocker = computed(() => approvalIssue.value?.message ?? '');
  const approvalField = computed(() => approvalIssue.value?.field ?? '');
  const canApprove = computed(() => !approvalIssue.value);

  function resetDraft(candidate = selectedCandidate.value) {
    Object.assign(draft, draftFor(candidate));
  }

  function selectCandidate(candidateId) {
    const candidate = dataset.value?.candidates.find(
      (item) => item.id === candidateId,
    );
    if (!candidate) return;
    selectedCandidateId.value = candidate.id;
    resetDraft(candidate);
  }

  function selectStratum(stratumId) {
    if (!dataset.value?.strata.some((stratum) => stratum.id === stratumId)) {
      return;
    }
    selectedStratumId.value = stratumId;
    const first = visibleCandidates.value[0];
    selectedCandidateId.value = first?.id ?? null;
    resetDraft(first ?? null);
  }

  function reconcileSelection() {
    if (
      visibleCandidates.value.some(
        (candidate) => candidate.id === selectedCandidateId.value,
      )
    ) {
      return;
    }
    const first = visibleCandidates.value[0] ?? null;
    selectedCandidateId.value = first?.id ?? null;
    resetDraft(first);
  }

  function setDecisionFilter(value) {
    if (!DECISION_FILTERS.has(value)) return;
    decisionFilter.value = value;
    reconcileSelection();
  }

  function setReachFilter(value) {
    if (!REACH_FILTERS.has(value)) return;
    reachFilter.value = value;
    reconcileSelection();
  }

  function setQuery(value) {
    query.value = String(value ?? '').slice(0, MAX_TEXT_LENGTH);
    reconcileSelection();
  }

  function replaceDataset(nextDataset) {
    dataset.value = nextDataset;
    exported.value = false;
  }

  function initializeSelection() {
    const stratum =
      dataset.value?.strata.find(({ counts }) => counts.pending > 0) ??
      dataset.value?.strata[0] ??
      null;
    selectedStratumId.value = stratum?.id ?? null;
    const first = visibleCandidates.value[0] ?? null;
    selectedCandidateId.value = first?.id ?? null;
    resetDraft(first);
  }

  async function load() {
    if (!bridge?.loadLyricsProviderReview || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      replaceDataset(await bridge.loadLyricsProviderReview());
      initializeSelection();
    } catch {
      error.value = { ...PUBLIC_LOAD_ERROR };
    } finally {
      loading.value = false;
    }
  }

  function advanceAfterSave(previousIds, previousIndex) {
    const nextCandidates = visibleCandidates.value;
    if (nextCandidates.length === 0) {
      selectedCandidateId.value = null;
      resetDraft(null);
      return;
    }
    const savedId = previousIds[previousIndex];
    const retainedIndex = nextCandidates.findIndex(
      (candidate) => candidate.id === savedId,
    );
    const next =
      retainedIndex >= 0
        ? nextCandidates[(retainedIndex + 1) % nextCandidates.length]
        : nextCandidates[Math.min(previousIndex, nextCandidates.length - 1)];
    selectCandidate(next.id);
  }

  async function saveAndAdvance(intent) {
    if (!bridge?.saveLyricsProviderReviewDecision || saving.value) return false;
    const previousIds = visibleCandidates.value.map(({ id }) => id);
    const previousIndex = Math.max(
      0,
      previousIds.indexOf(selectedCandidateId.value),
    );
    saving.value = true;
    error.value = null;
    try {
      replaceDataset(await bridge.saveLyricsProviderReviewDecision(intent));
      advanceAfterSave(previousIds, previousIndex);
      return true;
    } catch {
      error.value = { ...PUBLIC_SAVE_ERROR };
      return false;
    } finally {
      saving.value = false;
    }
  }

  function approveAndNext() {
    if (!selectedCandidate.value || !canApprove.value) return false;
    return saveAndAdvance({
      candidateId: selectedCandidate.value.id,
      decision: 'approved',
      confirmation: {
        title: draft.title.trim(),
        artist: draft.artist.trim(),
        album: draft.album.trim() || null,
        durationSeconds: Number(draft.durationSeconds),
        languageTag: draft.languageTag,
        version: draft.version,
        eraTag: draft.eraTag || null,
        versionTrap: draft.versionTrap === true,
      },
    });
  }

  function rejectAndNext(rejectionReason) {
    if (!selectedCandidate.value || !REJECTION_REASONS.has(rejectionReason)) {
      return false;
    }
    return saveAndAdvance({
      candidateId: selectedCandidate.value.id,
      decision: 'rejected',
      rejectionReason,
    });
  }

  async function exportCorpus() {
    if (
      !bridge?.exportLyricsProviderReviewCorpus ||
      exporting.value ||
      !dataset.value?.canExport
    ) {
      return false;
    }
    exporting.value = true;
    error.value = null;
    try {
      await bridge.exportLyricsProviderReviewCorpus();
      exported.value = true;
      return true;
    } catch {
      error.value = { ...PUBLIC_EXPORT_ERROR };
      return false;
    } finally {
      exporting.value = false;
    }
  }

  return {
    dataset: readonly(dataset),
    loading: readonly(loading),
    saving: readonly(saving),
    exporting: readonly(exporting),
    exported: readonly(exported),
    error: readonly(error),
    selectedStratumId,
    selectedCandidateId: readonly(selectedCandidateId),
    decisionFilter,
    reachFilter,
    query,
    draft,
    selectedCandidate,
    selectedStratum,
    visibleCandidates,
    approvalBlocker,
    approvalField,
    canApprove,
    load,
    selectStratum,
    selectCandidate,
    setDecisionFilter,
    setReachFilter,
    setQuery,
    approveAndNext,
    rejectAndNext,
    exportCorpus,
  };
}
