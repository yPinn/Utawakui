import { computed, reactive, readonly } from 'vue';
import {
  createReleaseDraft,
  releaseDraftIntent,
} from '../utils/releasePresentation.js';
import { useAppConfirmation } from './useAppConfirmation.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { usePlaylists } from './usePlaylists.js';
import { useReleaseMembers } from './useReleaseMembers.js';

const state = reactive({
  mode: 'edit',
  collectionId: null,
  track: null,
  name: '',
  libraryEpoch: null,
  release: null,
  draft: null,
  loading: false,
  saving: false,
  loadingMore: false,
  needsReload: false,
  error: '',
});
const { confirm } = useAppConfirmation();
const { recordError } = useAppDiagnostics();
let generation = 0;
let readGeneration = 0;
let baseline = '';
let unsubscribe = null;
let releaseQueryGeneration = 0;
const pendingMutationEvents = new Set();
const bridge = () => globalThis.window?.Utawakui;
const isOpen = computed(() => Boolean(state.collectionId || state.track));
const isDirty = computed(() =>
  state.mode === 'create'
    ? state.name !== baseline
    : Boolean(state.draft) && JSON.stringify(state.draft) !== baseline,
);

function reset() {
  generation += 1;
  readGeneration += 1;
  pendingMutationEvents.clear();
  Object.assign(state, {
    mode: 'edit',
    collectionId: null,
    track: null,
    name: '',
    libraryEpoch: null,
    release: null,
    draft: null,
    loading: false,
    saving: false,
    loadingMore: false,
    needsReload: false,
    error: '',
  });
  baseline = '';
}
function apply(result) {
  state.mode = 'edit';
  state.collectionId = result.release.id;
  state.track = null;
  state.libraryEpoch = result.libraryEpoch;
  state.release = result.release;
  state.draft = createReleaseDraft(result.release);
  state.needsReload = false;
  state.error = '';
  baseline = JSON.stringify(state.draft);
}
function expected(result) {
  if (result?.status === 'stale') {
    reset();
    return;
  }
  const messages = {
    conflict: '資料已變更，草稿仍保留。請重新載入後再編輯。',
    'not-found': '找不到這份發行，請重新載入曲庫。',
    'binding-mismatch': '音源已變更，請確認成員後再儲存。',
    'recovery-pending': '曲庫正在恢復資料，請稍後重試。',
    'invalid-intent': '發行資料格式無效，請確認欄位內容。',
    'limit-reached': '已達曲庫集合數量上限，請先移除不需要的集合。',
  };
  state.needsReload = ['conflict', 'not-found'].includes(result?.status);
  state.error =
    messages[result?.status] || '目前無法讀取或儲存發行資料，請再試一次。';
}
function report(error, operation) {
  return recordError(error, {
    code: 'RELEASE_ORGANIZATION_FAILED',
    source: 'release-organization',
    operation,
    title: '發行資料未更新',
    message: '目前無法讀取或儲存發行資料，請再試一次。',
    context: { retryable: true },
  }).message;
}
async function close() {
  if (state.saving) return false;
  const current = generation;
  if (
    isDirty.value &&
    !(await confirm({
      title: '捨棄發行資料變更？',
      subject: state.release?.name || state.track?.title,
      message: '尚未儲存的變更將會捨棄。',
      confirmLabel: '捨棄變更',
    }))
  )
    return false;
  if (current !== generation) return false;
  reset();
  return true;
}
async function reload() {
  if (!state.collectionId || state.saving) return false;
  const current = generation;
  const read = ++readGeneration;
  state.loading = true;
  state.error = '';
  try {
    const result = await bridge()?.getReleaseInfo?.({
      collectionId: state.collectionId,
    });
    if (current !== generation || read !== readGeneration) return false;
    if (result?.status !== 'ok') {
      expected(result);
      return false;
    }
    if (
      state.libraryEpoch !== null &&
      result.libraryEpoch !== state.libraryEpoch
    ) {
      reset();
      return false;
    }
    apply(result);
    return true;
  } catch (error) {
    if (current === generation && read === readGeneration)
      state.error = report(error, 'read');
    return false;
  } finally {
    if (current === generation && read === readGeneration)
      state.loading = false;
  }
}
async function open(collectionId) {
  if (!collectionId || state.saving) return false;
  if (isOpen.value && isDirty.value && !(await close())) return false;
  reset();
  state.collectionId = collectionId;
  return reload();
}
async function findTrackReleases(trackId) {
  const current = releaseQueryGeneration;
  let result = await bridge()?.getTrackReleases?.({ trackId, limit: 50 });
  if (current !== releaseQueryGeneration) return { status: 'stale' };
  if (result?.status !== 'ok') return result;
  const epoch = result.libraryEpoch;
  const releases = [...(result.releases ?? [])];
  let offset = 0;
  while (result.hasMore) {
    if (
      !Number.isSafeInteger(result.nextOffset) ||
      result.nextOffset <= offset ||
      result.nextOffset > 500
    )
      return { status: 'invalid-intent' };
    offset = result.nextOffset;
    result = await bridge()?.getTrackReleases?.({ trackId, limit: 50, offset });
    if (current !== releaseQueryGeneration || result?.libraryEpoch !== epoch)
      return { status: 'stale' };
    if (result?.status !== 'ok') return result;
    releases.push(...(result.releases ?? []));
  }
  const unique = [
    ...new Map(releases.map((release) => [release.id, release])).values(),
  ];
  useReleaseMembers().admitTrackReleases(trackId, unique, epoch);
  return { status: 'ok', libraryEpoch: epoch, releases: unique };
}
async function openCreate(track) {
  if (track?.sourceType !== 'local-file' || !track.id || state.saving)
    return false;
  if (isOpen.value && isDirty.value && !(await close())) return false;
  reset();
  state.mode = 'create';
  state.track = { ...track };
  state.name = String(track.title ?? '').slice(0, 200);
  baseline = state.name;
  state.loading = true;
  const current = generation;
  try {
    const result = await findTrackReleases(track.id);
    if (current !== generation) return false;
    if (result?.status !== 'ok') {
      expected(result);
      return false;
    }
    state.libraryEpoch = result.libraryEpoch;
    return true;
  } catch (error) {
    if (current === generation) state.error = report(error, 'create-read');
    return false;
  } finally {
    if (current === generation) state.loading = false;
  }
}
async function create() {
  if (
    state.mode !== 'create' ||
    !state.track ||
    state.libraryEpoch === null ||
    state.loading ||
    state.saving
  )
    return false;
  const name = state.name.trim();
  if (!name) {
    state.error = '請輸入發行名稱。';
    return false;
  }
  const current = generation;
  let applied = false;
  pendingMutationEvents.clear();
  state.saving = true;
  state.error = '';
  try {
    const result = await bridge()?.createLocalRelease?.({
      trackId: state.track.id,
      name,
      libraryEpoch: state.libraryEpoch,
    });
    if (current !== generation) return false;
    if (result?.status !== 'ok') {
      expected(result);
      return false;
    }
    if (result.libraryEpoch !== state.libraryEpoch) {
      reset();
      return false;
    }
    apply(result);
    applied = true;
    await usePlaylists().refresh();
    return true;
  } catch (error) {
    if (current === generation) state.error = report(error, 'create');
    return false;
  } finally {
    if (current === generation) {
      state.saving = false;
      if (pendingMutationEvents.has(state.collectionId)) {
        pendingMutationEvents.clear();
        if (applied && !isDirty.value) await reload();
        else state.needsReload = true;
      }
    }
  }
}
function updateField(field, key, value) {
  if (
    state.saving ||
    !state.draft ||
    !['type', 'date', 'totalTrackCount'].includes(field) ||
    !['mode', 'value', 'precision'].includes(key)
  )
    return;
  state.draft[field][key] = String(value ?? '').slice(0, 200);
}
function setLeadTrackId(value) {
  if (state.draft && !state.saving)
    state.draft.leadTrackId = String(value ?? '');
}
function setName(value) {
  if (!state.saving) state.name = String(value ?? '').slice(0, 200);
}
async function save(repair = {}) {
  if (
    !state.release ||
    !state.draft ||
    state.saving ||
    state.loading ||
    state.needsReload
  )
    return false;
  let intent;
  try {
    intent = releaseDraftIntent(state.release, state.draft);
  } catch (error) {
    state.error = error.message;
    return false;
  }
  const current = generation;
  let applied = false;
  pendingMutationEvents.clear();
  state.saving = true;
  state.error = '';
  try {
    const result = await bridge()?.saveReleaseInfo?.({
      collectionId: state.collectionId,
      expectedRevision: state.release.revision,
      libraryEpoch: state.libraryEpoch,
      ...intent,
      ...(repair.initializeBindings === true
        ? { initializeBindings: true }
        : {}),
      ...(Array.isArray(repair.reconfirmTrackIds)
        ? { reconfirmTrackIds: repair.reconfirmTrackIds.slice(0, 100) }
        : {}),
    });
    if (current !== generation) return false;
    if (result?.status !== 'ok') {
      expected(result);
      return false;
    }
    if (result.libraryEpoch !== state.libraryEpoch) {
      reset();
      return false;
    }
    apply(result);
    applied = true;
    await usePlaylists().refresh();
    return true;
  } catch (error) {
    if (current === generation) state.error = report(error, 'save');
    return false;
  } finally {
    if (current === generation) {
      state.saving = false;
      if (pendingMutationEvents.has(state.collectionId)) {
        pendingMutationEvents.clear();
        if (applied && !isDirty.value) await reload();
        else state.needsReload = true;
      }
    }
  }
}
async function loadMore() {
  if (
    !state.release?.hasMore ||
    state.loadingMore ||
    state.saving ||
    state.loading ||
    state.needsReload
  )
    return false;
  const current = generation;
  const revision = state.release.revision;
  state.loadingMore = true;
  try {
    const result = await bridge()?.getReleaseInfo?.({
      collectionId: state.collectionId,
      offset: state.release.nextOffset,
      limit: 100,
    });
    if (current !== generation) return false;
    if (result?.status !== 'ok') {
      expected(result);
      return false;
    }
    if (result.libraryEpoch !== state.libraryEpoch) {
      reset();
      return false;
    }
    if (
      result.release.revision !== revision ||
      state.release.revision !== revision
    ) {
      expected({ status: 'conflict' });
      return false;
    }
    const members = new Map(
      state.release.members.map((member) => [member.trackId, member]),
    );
    for (const member of result.release.members)
      members.set(member.trackId, member);
    state.release = {
      ...state.release,
      members: [...members.values()],
      hasMore: result.release.hasMore,
      nextOffset: result.release.nextOffset,
    };
    return true;
  } catch (error) {
    if (current === generation) state.error = report(error, 'load-more');
    return false;
  } finally {
    if (current === generation) state.loadingMore = false;
  }
}
function initialize() {
  useReleaseMembers().initialize();
  if (unsubscribe || !bridge()?.onReleaseOrganizationChanged) return;
  unsubscribe = bridge().onReleaseOrganizationChanged((event) => {
    releaseQueryGeneration += 1;
    void usePlaylists().refresh();
    if (!isOpen.value) return;
    if (
      state.libraryEpoch === null ||
      state.libraryEpoch !== event.libraryEpoch
    ) {
      reset();
      return;
    }
    if (state.saving) {
      for (const id of event.collectionIds ?? []) pendingMutationEvents.add(id);
      return;
    }
    if (!(event.collectionIds ?? []).includes(state.collectionId)) return;
    if (isDirty.value) expected({ status: 'conflict' });
    else void reload();
  });
}
function dispose() {
  unsubscribe?.();
  unsubscribe = null;
  releaseQueryGeneration += 1;
  useReleaseMembers().dispose();
  reset();
}
export function useReleaseOrganization() {
  return {
    state: readonly(state),
    isOpen,
    isDirty,
    open,
    openCreate,
    create,
    close,
    reload,
    updateField,
    setLeadTrackId,
    setName,
    save,
    loadMore,
    findTrackReleases,
    initialize,
    dispose,
  };
}
