import { computed, reactive, readonly } from 'vue';
import { useAppConfirmation } from './useAppConfirmation.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';

const emptyVersion = () => ({
  arrangement: 'unspecified',
  performance: 'unspecified',
  vocal: 'unspecified',
  label: '',
  note: '',
});
const state = reactive({
  track: null,
  snapshot: null,
  versionInfo: emptyVersion(),
  relationship: 'unknown',
  selection: { kind: 'keep' },
  loading: false,
  saving: false,
  searching: false,
  searched: false,
  loadingMore: false,
  query: '',
  results: { works: [], tracks: [] },
  error: '',
  searchError: '',
  needsReload: false,
});
const { confirm } = useAppConfirmation();
const { recordError } = useAppDiagnostics();
let generation = 0;
let readGeneration = 0;
let searchGeneration = 0;
let unsubscribe = null;
let baseline = '';
let observedRevision = 0;

const draftKey = () =>
  JSON.stringify({
    versionInfo: state.versionInfo,
    relationship: state.relationship,
    selection: state.selection,
  });
const isOpen = computed(() => Boolean(state.track));
const isDirty = computed(
  () => Boolean(state.snapshot) && draftKey() !== baseline,
);

function reset() {
  generation += 1;
  readGeneration += 1;
  searchGeneration += 1;
  Object.assign(state, {
    track: null,
    snapshot: null,
    versionInfo: emptyVersion(),
    relationship: 'unknown',
    selection: { kind: 'keep' },
    loading: false,
    saving: false,
    searching: false,
    searched: false,
    loadingMore: false,
    query: '',
    results: { works: [], tracks: [] },
    error: '',
    searchError: '',
    needsReload: false,
  });
  baseline = '';
  observedRevision = 0;
}

function applySnapshot(snapshot) {
  state.snapshot = snapshot;
  state.versionInfo = { ...emptyVersion(), ...snapshot.versionInfo };
  state.relationship = snapshot.relationship || 'unknown';
  state.selection = { kind: 'keep' };
  state.needsReload = observedRevision > snapshot.revision;
  state.error = state.needsReload ? '資料已變更，請重新載入後再編輯。' : '';
  observedRevision = Math.max(observedRevision, snapshot.revision);
  baseline = draftKey();
}

function report(error, operation) {
  return recordError(error, {
    code: 'WORK_ORGANIZATION_FAILED',
    source: 'work-organization',
    operation,
    title: '歌曲整理未完成',
    message: '目前無法讀取或儲存歌曲資料，請再試一次。',
    context: { retryable: true },
  }).message;
}

function expectedFailure(result) {
  if (result?.status === 'stale') {
    reset();
    return;
  }
  state.needsReload = ['conflict', 'not-found'].includes(result?.status);
  if (result?.status === 'target-changed') {
    state.error = '所選曲目的音源已變更，請先確認該曲或選擇其他曲目。';
  } else if (result?.status === 'binding-mismatch') {
    if (state.snapshot)
      state.snapshot = { ...state.snapshot, bindingStatus: 'changed' };
    state.error = '音源已變更，請確認這首曲目的歌曲與版本後重新儲存。';
  } else if (state.needsReload) {
    state.error = '資料已變更，草稿仍保留。請重新載入後再編輯。';
  } else state.error = '目前無法讀取或儲存歌曲資料，請再試一次。';
}

async function reload() {
  if (!state.track || state.saving) return false;
  const current = generation;
  const request = ++readGeneration;
  searchGeneration += 1;
  state.loading = true;
  state.searching = false;
  state.searched = false;
  state.searchError = '';
  state.results = { works: [], tracks: [] };
  state.error = '';
  try {
    const result = await window.Utawakui.getWorkOrganization({
      trackId: state.track.id,
    });
    if (current !== generation || request !== readGeneration) return false;
    if (result?.status !== 'ok') {
      expectedFailure(result);
      return false;
    }
    if (state.snapshot && result.libraryEpoch !== state.snapshot.libraryEpoch) {
      reset();
      return false;
    }
    applySnapshot(result);
    state.loading = false;
    const query = state.query || state.track.title || '';
    if (query.trim()) await search(query.slice(0, 200));
    return current === generation && request === readGeneration;
  } catch (error) {
    if (current === generation && request === readGeneration)
      state.error = report(error, 'read');
    return false;
  } finally {
    if (current === generation && request === readGeneration)
      state.loading = false;
  }
}

async function close({ discardChanges = false } = {}) {
  if (state.saving) return false;
  const current = generation;
  if (
    !discardChanges &&
    isDirty.value &&
    !(await confirm({
      title: '捨棄歌曲整理變更？',
      subject: state.track?.title,
      message: '尚未儲存的變更將會捨棄。',
      confirmLabel: '捨棄變更',
    }))
  )
    return false;
  if (current !== generation) return false;
  reset();
  return true;
}

async function open(track) {
  if (!track?.id || typeof track.id !== 'string' || state.saving) return false;
  if (state.track && isDirty.value && !(await close())) return false;
  reset();
  state.track = { ...track };
  return reload();
}

async function search(query) {
  if (!state.snapshot || !state.track) return false;
  const current = generation;
  const request = ++searchGeneration;
  state.query = String(query ?? '').slice(0, 200);
  state.searching = true;
  state.searched = false;
  state.searchError = '';
  state.results = { works: [], tracks: [] };
  try {
    const result = await window.Utawakui.searchWorkOrganization({
      trackId: state.track.id,
      query: state.query,
      limit: 30,
    });
    if (current !== generation || request !== searchGeneration) return false;
    if (result?.status !== 'ok') {
      state.searchError = '目前無法搜尋歌曲，請再試一次。';
      return false;
    }
    if (result.libraryEpoch !== state.snapshot.libraryEpoch) {
      reset();
      return false;
    }
    state.results = { works: result.works || [], tracks: result.tracks || [] };
    state.searched = true;
    return true;
  } catch (error) {
    if (current === generation && request === searchGeneration)
      state.searchError = report(error, 'search');
    return false;
  } finally {
    if (current === generation && request === searchGeneration)
      state.searching = false;
  }
}

function updateQuery(value) {
  searchGeneration += 1;
  state.query = String(value ?? '').slice(0, 200);
  state.searching = false;
  state.searched = false;
  state.searchError = '';
  state.results = { works: [], tracks: [] };
}

async function loadMore() {
  if (
    !state.snapshot?.hasMore ||
    state.loadingMore ||
    state.loading ||
    state.saving ||
    state.needsReload
  )
    return false;
  const current = generation;
  const revision = state.snapshot.revision;
  const libraryEpoch = state.snapshot.libraryEpoch;
  state.loadingMore = true;
  try {
    const result = await window.Utawakui.getWorkOrganization({
      trackId: state.track.id,
      offset: state.snapshot.nextOffset,
      limit: 100,
    });
    if (current !== generation) return false;
    if (result?.status !== 'ok') {
      expectedFailure(result);
      return false;
    }
    if (result.libraryEpoch !== libraryEpoch) {
      reset();
      return false;
    }
    if (result.revision !== revision || state.snapshot.revision !== revision) {
      state.needsReload = true;
      state.error = '資料已變更，請重新載入版本清單。';
      return false;
    }
    const byId = new Map(
      state.snapshot.relatedVersions.map((item) => [item.trackId, item]),
    );
    for (const item of result.relatedVersions) byId.set(item.trackId, item);
    state.snapshot = {
      ...state.snapshot,
      relatedVersions: [...byId.values()],
      hasMore: result.hasMore,
      nextOffset: result.nextOffset,
    };
    return true;
  } catch (error) {
    if (current === generation) state.error = report(error, 'load-more');
    return false;
  } finally {
    if (current === generation) state.loadingMore = false;
  }
}

function select(selection) {
  if (
    !state.snapshot ||
    state.saving ||
    !['keep', 'none', 'existing', 'new', 'track'].includes(selection?.kind)
  )
    return;
  state.selection = { ...selection };
}

function updateVersion(field, value) {
  if (!(field in state.versionInfo) || state.saving) return;
  const limits = { label: 120, note: 500 };
  state.versionInfo[field] = String(value ?? '').slice(0, limits[field] || 30);
}

async function save({ reconfirm = false } = {}) {
  if (!state.snapshot || state.loading || state.saving || state.needsReload)
    return false;
  if (state.snapshot.bindingStatus === 'changed' && !reconfirm) return false;
  if (
    state.selection.kind === 'new' &&
    !String(state.selection.title || '').trim()
  ) {
    state.error = '請輸入作品名稱。';
    return false;
  }
  const current = generation;
  state.saving = true;
  state.error = '';
  try {
    const result = await window.Utawakui.saveWorkOrganization({
      trackId: state.track.id,
      expectedRevision: state.snapshot.revision,
      libraryEpoch: state.snapshot.libraryEpoch,
      selection: { ...state.selection },
      relationship:
        state.selection.kind === 'none' ? 'unknown' : state.relationship,
      versionInfo: { ...state.versionInfo },
      ...(reconfirm ? { reconfirm: true } : {}),
    });
    if (current !== generation) return false;
    if (result?.status !== 'ok') {
      expectedFailure(result);
      return false;
    }
    if (result.libraryEpoch !== state.snapshot.libraryEpoch) {
      reset();
      return false;
    }
    applySnapshot(result);
    return true;
  } catch (error) {
    if (current === generation) state.error = report(error, 'save');
    return false;
  } finally {
    if (current === generation) state.saving = false;
  }
}

function initialize() {
  if (
    unsubscribe ||
    typeof window?.Utawakui?.onWorkOrganizationChanged !== 'function'
  )
    return;
  unsubscribe = window.Utawakui.onWorkOrganizationChanged((event) => {
    if (!state.track) return;
    if (!state.snapshot || event.libraryEpoch !== state.snapshot.libraryEpoch) {
      reset();
      return;
    }
    observedRevision = Math.max(observedRevision, event.revision);
    if (event.revision <= state.snapshot.revision || state.saving) return;
    if (isDirty.value) {
      state.needsReload = true;
      state.error = '資料已變更，草稿仍保留。請重新載入後再編輯。';
    } else void reload();
  });
}

function dispose() {
  unsubscribe?.();
  unsubscribe = null;
  reset();
}

export function useWorkOrganization() {
  return {
    state: readonly(state),
    isOpen,
    isDirty,
    updateTrack: (track) => {
      if (state.track?.id === track?.id) state.track = { ...track };
    },
    open,
    close,
    reload,
    search,
    updateQuery,
    loadMore,
    select,
    updateVersion,
    setRelationship: (value) => {
      if (!state.saving) state.relationship = value;
    },
    save,
    initialize,
    dispose,
  };
}
