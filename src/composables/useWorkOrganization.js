import { computed, reactive, readonly } from 'vue';
import { useAppConfirmation } from './useAppConfirmation.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { t } from '../utils/i18n.js';
import { trackTitlePresentation } from '../utils/trackTitlePresentation.js';
import { readTrackTitleHints } from '../../shared/trackTitleHints.mjs';

const emptyVersion = () => ({
  arrangement: 'unspecified',
  performance: 'unspecified',
  vocal: 'unspecified',
  label: '',
  note: '',
});
const emptyPresentation = () => ({
  displayTitle: '',
  inheritTitle: true,
  artistCredits: [],
  hintsReviewed: false,
});
const emptyNames = () => ({
  displayTitle: '',
  inheritTitle: true,
  artistCredits: '',
  workTitle: '',
  aliases: '',
});
const state = reactive({
  track: null,
  snapshot: null,
  versionInfo: emptyVersion(),
  relationship: 'unknown',
  names: emptyNames(),
  titleSuggestion: false,
  pendingCoverSuggestion: false,
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
let relationshipTouched = false;

const draftKey = () =>
  JSON.stringify({
    versionInfo: state.versionInfo,
    relationship: state.relationship,
    selection: state.selection,
    names: state.names,
  });
const isOpen = computed(() => Boolean(state.track));
const isDirty = computed(
  () => Boolean(state.snapshot) && draftKey() !== baseline,
);
const hasSuggestions = computed(() => state.titleSuggestion);

function reset() {
  generation += 1;
  readGeneration += 1;
  searchGeneration += 1;
  Object.assign(state, {
    track: null,
    snapshot: null,
    versionInfo: emptyVersion(),
    relationship: 'unknown',
    names: emptyNames(),
    titleSuggestion: false,
    pendingCoverSuggestion: false,
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
  relationshipTouched = false;
}

function applySnapshot(snapshot, { suggest = true } = {}) {
  state.snapshot = snapshot;
  state.versionInfo = { ...emptyVersion(), ...snapshot.versionInfo };
  state.relationship = snapshot.relationship || 'unknown';
  state.selection = { kind: 'keep' };
  const presentation = { ...emptyPresentation(), ...snapshot.presentation };
  state.names = {
    displayTitle: presentation.displayTitle,
    inheritTitle: presentation.inheritTitle,
    artistCredits: presentation.artistCredits.join('\n'),
    workTitle: snapshot.work?.title ?? '',
    aliases: snapshot.work?.aliases?.join('\n') ?? '',
  };
  state.titleSuggestion = false;
  state.pendingCoverSuggestion = false;
  relationshipTouched = false;
  if (
    suggest &&
    !presentation.hintsReviewed &&
    snapshot.bindingStatus !== 'changed'
  ) {
    const { version, cover } = readTrackTitleHints(state.track?.title);
    const field = {
      acoustic: 'arrangement',
      remix: 'arrangement',
      live: 'performance',
      demo: 'performance',
      instrumental: 'vocal',
    }[version];
    if (field && state.versionInfo[field] === 'unspecified') {
      state.versionInfo[field] = version;
      state.titleSuggestion = true;
    }
    if (cover && snapshot.work && state.relationship === 'unknown') {
      state.relationship = 'cover';
      state.titleSuggestion = true;
    }
  }
  state.needsReload = observedRevision > snapshot.revision;
  state.error = state.needsReload ? t('workOrganize.reload') : '';
  observedRevision = Math.max(observedRevision, snapshot.revision);
  baseline = draftKey();
}

function report(error, operation) {
  return recordError(error, {
    code: 'WORK_ORGANIZATION_FAILED',
    source: 'work-organization',
    operation,
    title: t('workOrganize.failedTitle'),
    message: t('workOrganize.failed'),
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
    state.error = t('workOrganize.targetChanged');
  } else if (result?.status === 'binding-mismatch') {
    if (state.snapshot)
      state.snapshot = { ...state.snapshot, bindingStatus: 'changed' };
    state.error = t('workOrganize.audioChanged');
  } else if (state.needsReload) {
    state.error = t('workOrganize.conflict');
  } else state.error = t('workOrganize.failed');
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
    const query =
      state.query ||
      (result.relationship === 'cover' && result.work?.title) ||
      trackTitlePresentation(state.track).queryTitle;
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
      title: t('workOrganize.discardTitle'),
      subject: state.track?.title,
      message: t('workOrganize.discardMessage'),
      confirmLabel: t('workOrganize.discardConfirm'),
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
      state.searchError = t('workOrganize.searchFailed');
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
      state.error = t('workOrganize.versionsReload');
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
  if (
    state.pendingCoverSuggestion &&
    ['keep', 'none'].includes(selection.kind)
  ) {
    state.pendingCoverSuggestion = false;
    state.relationship = 'unknown';
  }
  if (
    ['track', 'new', 'existing'].includes(selection.kind) &&
    !state.snapshot.work &&
    !relationshipTouched &&
    state.relationship === 'unknown' &&
    readTrackTitleHints(state.track?.title).cover
  ) {
    state.relationship = 'cover';
    state.pendingCoverSuggestion = true;
  }
}

function updateName(field, value) {
  if (state.saving || !Object.hasOwn(state.names, field)) return;
  state.names[field] =
    field === 'inheritTitle' ? Boolean(value) : String(value ?? '');
}

function nameLines(value) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
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
    state.error = t('workOrganize.nameRequired');
    return false;
  }
  const { displayTitle, inheritTitle, workTitle } = state.names;
  const artistCredits = nameLines(state.names.artistCredits);
  const aliases = nameLines(state.names.aliases);
  const normalizedCredits = artistCredits.map((name) =>
    name.normalize('NFKC').toLowerCase(),
  );
  const work = state.snapshot.work;
  const workEdited =
    work &&
    (workTitle.trim() !== work.title ||
      JSON.stringify(aliases) !== JSON.stringify(work.aliases ?? []));
  if (workEdited && state.selection.kind !== 'keep') {
    state.error = t('workOrganize.saveWorkBeforeRelinking');
    return false;
  }
  if (
    (workEdited && !workTitle.trim()) ||
    aliases.length > 16 ||
    artistCredits.length > 16 ||
    new Set(normalizedCredits).size !== artistCredits.length ||
    [displayTitle, workTitle, ...aliases, ...artistCredits].some(
      (name) => name.length > 200,
    )
  ) {
    state.error = t('workOrganize.invalidNames');
    return false;
  }
  const presentation = {
    displayTitle: displayTitle.trim(),
    inheritTitle,
    artistCredits,
    hintsReviewed: Boolean(
      state.snapshot.presentation?.hintsReviewed ||
      state.titleSuggestion ||
      state.pendingCoverSuggestion ||
      relationshipTouched,
    ),
  };
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
      ...(JSON.stringify(presentation) !==
        JSON.stringify(emptyPresentation()) || state.snapshot.presentation
        ? { presentation }
        : {}),
      ...(workEdited
        ? { workDetails: { title: workTitle.trim(), aliases } }
        : {}),
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
    applySnapshot(result, { suggest: false });
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
      state.error = t('workOrganize.conflict');
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
    hasSuggestions,
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
    updateName,
    setRelationship: (value) => {
      if (!state.saving) {
        relationshipTouched = true;
        state.pendingCoverSuggestion = false;
        state.relationship = value;
      }
    },
    save,
    initialize,
    dispose,
  };
}
