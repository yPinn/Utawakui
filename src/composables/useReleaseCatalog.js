import { reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';

export function createReleaseCatalogSession(
  bridge,
  requireProvider = async () => true,
) {
  const state = reactive({
    open: false,
    track: null,
    busy: false,
    error: '',
    message: '',
    candidates: [],
    candidateId: '',
    preview: null,
    position: null,
    revision: 0,
  });
  let token = 0,
    epoch = null;
  const dispose = bridge?.onReleaseOrganizationChanged?.((event) => {
    state.revision++;
    if (epoch !== null && epoch !== event.libraryEpoch) {
      token++;
      state.busy = false;
      state.candidates = [];
      state.preview = null;
      state.error = '曲庫位置已變更，請重新開啟專輯整理。';
    }
    epoch = event.libraryEpoch;
  });
  function open(track) {
    token++;
    Object.assign(state, {
      open: true,
      track: { id: track.id, title: track.title },
      busy: false,
      error: '',
      message: '',
      candidates: [],
      candidateId: '',
      preview: null,
      position: null,
    });
  }
  async function operation(work, apply) {
    const request = ++token;
    state.busy = true;
    state.error = '';
    state.message = '';
    try {
      if (!(await requireProvider())) return;
      if (request !== token) return;
      const result = await work();
      if (request !== token) return;
      if (!result || !['ok', 'complete'].includes(result.status))
        throw Error('Unavailable');
      apply(result);
    } catch {
      if (request === token)
        state.error =
          '專輯資料未完成，可能已變更或來源暫時不可用。請重新查詢後再試。';
    } finally {
      if (request === token) state.busy = false;
    }
  }
  function search() {
    const trackId = state.track?.id;
    state.candidates = [];
    state.preview = null;
    state.position = null;
    return operation(
      () => bridge.searchReleaseCatalog({ trackId }),
      (result) => {
        epoch = result.libraryEpoch ?? epoch;
        state.candidates = result.candidates;
        if (!result.candidates.length)
          state.message =
            '沒有找到可確認的專輯，請先檢查歌曲的藝人與專輯資訊。';
      },
    );
  }
  function preview(candidateId, offset = 0) {
    const prior = offset ? (state.preview?.rows ?? []) : [];
    if (!offset) {
      state.preview = null;
      state.position = null;
    }
    return operation(
      () =>
        bridge.previewReleaseCatalog({
          candidateId,
          ...(offset ? { offset, limit: 100 } : {}),
        }),
      (result) => {
        state.candidateId = candidateId;
        state.preview = { ...result, rows: [...prior, ...result.rows] };
      },
    );
  }
  function accept() {
    if (!Number.isInteger(state.position) || !state.candidateId)
      return Promise.resolve();
    return operation(
      () =>
        bridge.acceptReleaseCatalog({
          candidateId: state.candidateId,
          position: state.position,
        }),
      () => {
        state.open = false;
      },
    );
  }
  function refresh(request = { trackId: state.track?.id }) {
    return operation(
      () => bridge.refreshReleaseCatalog(request),
      (result) => {
        state.message =
          result.updated > 0
            ? '已補齊專輯資料。'
            : '尚未取得可靠的專輯關聯，可選擇候選專輯與曲目位置。';
        state.revision++;
      },
    );
  }
  return {
    state: readonly(state),
    open,
    search,
    preview,
    accept,
    refresh,
    setPosition(position) {
      state.position = position;
    },
    close() {
      if (!state.busy) {
        token++;
        state.open = false;
      }
    },
    dispose() {
      token++;
      dispose?.();
    },
  };
}

const sessions = new WeakMap();
const activeSessions = new Set();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    activeSessions.forEach((session) => session.dispose());
    activeSessions.clear();
  });
const unavailable = {};
export function useReleaseCatalog() {
  const bridge = globalThis.window?.Utawakui ?? unavailable;
  if (!sessions.has(bridge)) {
    const access = useFeatureGateAccess();
    const session = createReleaseCatalogSession(bridge, () =>
      access.requireFeatureGate(FEATURE_IDS.PROVIDER_FLOW, {
        source: 'library-metadata',
        operation: 'release-catalog',
        message: '啟用外部來源後，即可查詢並補齊專輯資料。',
      }),
    );
    sessions.set(bridge, session);
    activeSessions.add(session);
  }
  return sessions.get(bridge);
}
