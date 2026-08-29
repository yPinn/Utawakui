import { computed, readonly, ref } from 'vue';
import {
  isReferenceCaseComplete,
  mergeReferenceBoundary,
  moveReferenceBoundary,
  splitReferenceSection,
  splitReferenceSectionWithRole,
  updateReferenceSectionRole,
} from '../utils/musicAnalysisReferenceAnnotation.js';

const PUBLIC_LOAD_ERROR = Object.freeze({
  title: '人工標註工作集無法開啟',
  message: '請確認選擇的是有效的 run config，且工作集屬於目前曲庫。',
  actionLabel: '重新選擇',
});
const PUBLIC_SAVE_ERROR = Object.freeze({
  title: '人工標註尚未儲存',
  message: '工作集未變更，請稍後再試。',
  actionLabel: '重試儲存',
});

function cloneDataset(value) {
  return {
    ...value,
    allowedRoles: [...value.allowedRoles],
    cases: value.cases.map((item) => ({
      ...item,
      tags: [...item.tags],
      referenceSections: item.referenceSections.map((section) => ({
        ...section,
      })),
    })),
  };
}

function createMusicAnalysisReferenceAnnotation(bridge, options = {}) {
  const dataset = ref(null);
  const selectedCaseId = ref(null);
  const loading = ref(false);
  const saving = ref(false);
  const dirty = ref(false);
  const error = ref(null);
  const autosaveDelayMs =
    Number.isFinite(options.autosaveDelayMs) && options.autosaveDelayMs >= 0
      ? options.autosaveDelayMs
      : 0;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let autosaveTimer = null;
  let editRevision = 0;

  const selectedCase = computed(
    () =>
      dataset.value?.cases.find(
        (referenceCase) => referenceCase.id === selectedCaseId.value,
      ) ?? null,
  );

  function selectCase(caseId) {
    if (!dataset.value?.cases.some((item) => item.id === caseId)) return;
    selectedCaseId.value = caseId;
  }

  function selectNextIncomplete() {
    const cases = dataset.value?.cases ?? [];
    if (cases.length < 2) return null;
    const selectedIndex = cases.findIndex(
      (item) => item.id === selectedCaseId.value,
    );
    for (let offset = 1; offset < cases.length; offset += 1) {
      const candidate =
        cases[(selectedIndex + offset + cases.length) % cases.length];
      if (!candidate.complete) {
        selectedCaseId.value = candidate.id;
        return candidate.id;
      }
    }
    return null;
  }

  function clearPendingAutosave() {
    if (autosaveTimer === null) return;
    clearTimer(autosaveTimer);
    autosaveTimer = null;
  }

  function scheduleAutosave() {
    if (autosaveDelayMs <= 0 || !bridge?.saveMusicAnalysisReferenceAnnotation) {
      return;
    }
    clearPendingAutosave();
    autosaveTimer = setTimer(() => {
      autosaveTimer = null;
      void save();
    }, autosaveDelayMs);
  }

  function mutateCase(caseId, mutation) {
    if (!dataset.value) return;
    const nextDataset = cloneDataset(dataset.value);
    const index = nextDataset.cases.findIndex((item) => item.id === caseId);
    if (index < 0) return;
    const nextCase = mutation(nextDataset.cases[index]);
    nextDataset.cases[index] = {
      ...nextCase,
      complete: isReferenceCaseComplete(nextCase),
    };
    nextDataset.annotationState = nextDataset.cases.every(
      (item) => item.complete,
    )
      ? 'complete'
      : 'draft';
    dataset.value = nextDataset;
    editRevision += 1;
    dirty.value = true;
    error.value = null;
    scheduleAutosave();
  }

  function updateBpm(caseId, value) {
    const referenceBpm =
      value === null || value === '' || !Number.isFinite(Number(value))
        ? null
        : Number(value);
    mutateCase(caseId, (item) => ({ ...item, referenceBpm }));
  }

  function addBoundary(caseId, boundaryMs) {
    mutateCase(caseId, (item) => ({
      ...item,
      referenceSections: splitReferenceSection(
        item.referenceSections,
        Math.round(boundaryMs),
        item.durationMs,
      ),
    }));
  }

  function addBoundaryWithRole(caseId, boundaryMs, role) {
    mutateCase(caseId, (item) => ({
      ...item,
      referenceSections: splitReferenceSectionWithRole(
        item.referenceSections,
        Math.round(boundaryMs),
        item.durationMs,
        role,
      ),
    }));
  }

  function moveBoundary(caseId, index, boundaryMs) {
    mutateCase(caseId, (item) => ({
      ...item,
      referenceSections: moveReferenceBoundary(
        item.referenceSections,
        index,
        Math.round(boundaryMs),
        item.durationMs,
      ),
    }));
  }

  function updateRole(caseId, index, role) {
    mutateCase(caseId, (item) => ({
      ...item,
      referenceSections: updateReferenceSectionRole(
        item.referenceSections,
        index,
        role || null,
      ),
    }));
  }

  function removeBoundary(caseId, index) {
    mutateCase(caseId, (item) => ({
      ...item,
      referenceSections: mergeReferenceBoundary(
        item.referenceSections,
        index,
        item.durationMs,
      ),
    }));
  }

  async function open() {
    if (!bridge?.openMusicAnalysisReferenceAnnotation || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const nextDataset = await bridge.openMusicAnalysisReferenceAnnotation();
      if (!nextDataset) return;
      dataset.value = cloneDataset(nextDataset);
      selectedCaseId.value = nextDataset.cases[0]?.id ?? null;
      clearPendingAutosave();
      editRevision = 0;
      dirty.value = false;
    } catch {
      error.value = { ...PUBLIC_LOAD_ERROR };
    } finally {
      loading.value = false;
    }
  }

  async function save() {
    if (
      !bridge?.saveMusicAnalysisReferenceAnnotation ||
      !dataset.value ||
      saving.value
    ) {
      return false;
    }
    clearPendingAutosave();
    const saveRevision = editRevision;
    const saveDataset = cloneDataset(dataset.value);
    saving.value = true;
    error.value = null;
    try {
      const saved = await bridge.saveMusicAnalysisReferenceAnnotation({
        sessionId: saveDataset.sessionId,
        cases: saveDataset.cases.map((item) => ({
          id: item.id,
          referenceBpm: item.referenceBpm,
          referenceSections: item.referenceSections.map((section) => ({
            startMs: section.startMs,
            endMs: section.endMs,
            role: section.role,
          })),
        })),
      });
      if (editRevision === saveRevision) {
        dataset.value = cloneDataset(saved);
        dirty.value = false;
      }
      return true;
    } catch {
      error.value = { ...PUBLIC_SAVE_ERROR };
      return false;
    } finally {
      saving.value = false;
      if (dirty.value && editRevision !== saveRevision) scheduleAutosave();
    }
  }

  return {
    dataset: readonly(dataset),
    selectedCaseId: readonly(selectedCaseId),
    selectedCase,
    loading: readonly(loading),
    saving: readonly(saving),
    dirty: readonly(dirty),
    error: readonly(error),
    open,
    save,
    selectCase,
    selectNextIncomplete,
    updateBpm,
    addBoundary,
    addBoundaryWithRole,
    moveBoundary,
    updateRole,
    removeBoundary,
  };
}

let sharedAnnotation = null;

export function useMusicAnalysisReferenceAnnotation(bridge, options) {
  if (arguments.length > 0) {
    return createMusicAnalysisReferenceAnnotation(bridge, options);
  }
  sharedAnnotation ??= createMusicAnalysisReferenceAnnotation(
    typeof window === 'undefined' ? null : window.Utawakui,
    { autosaveDelayMs: 1200 },
  );
  return sharedAnnotation;
}
