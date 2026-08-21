import { computed, reactive, readonly, watch } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { createLatestAsyncPublisher } from '../utils/latestAsyncPublisher.js';
import { projectOutputSnapshot } from '../utils/outputSnapshot.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useLyrics } from './useLyrics.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { usePlayer } from './usePlayer.js';

const EMPTY_STATUS = Object.freeze({
  running: false,
  host: '127.0.0.1',
  port: 17404,
  revision: 0,
  httpUrl: null,
  wsUrl: null,
  clients: 0,
});
const PROJECTION_TIMESTAMP = '1970-01-01T00:00:00.000Z';

const { state: playerState } = usePlayer();
const { state: queueState, upcomingTracks } = usePlaybackQueue();
const {
  state: lyricsState,
  selectedTrack: lyricsTrack,
  selectedSource: lyricsSource,
  lyricLines,
  activeLineIndex,
} = useLyrics();
const { requireFeatureGate } = useFeatureGateAccess();

const state = reactive({
  status: { ...EMPTY_STATUS },
  profiles: [],
  selectedProfileId: null,
  profilesLoaded: false,
  isStarting: false,
  isStopping: false,
  isLoadingProfiles: false,
  isSavingProfile: false,
  error: '',
});

let initialized = false;
let nextRevision = 0;

function bridgeMethod(name) {
  const method =
    typeof window !== 'undefined' ? window.Utawakui?.[name] : undefined;
  if (typeof method !== 'function') {
    throw new Error('輸出功能需要重新啟動應用程式才能載入新版橋接 API。');
  }
  return method;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function applyStatus(value = {}) {
  state.status = {
    ...EMPTY_STATUS,
    ...value,
    running: value.running === true,
  };
  if (Number.isSafeInteger(state.status.revision)) {
    nextRevision = Math.max(nextRevision, state.status.revision);
  }
}

function applyProfiles(document = {}) {
  state.profiles = Array.isArray(document.profiles) ? document.profiles : [];
  state.selectedProfileId =
    typeof document.selectedProfileId === 'string'
      ? document.selectedProfileId
      : null;
  state.profilesLoaded = true;
}

function projectionInput() {
  return {
    player: playerState,
    queue: {
      historyEntries: queueState.historyEntries,
      currentTrack: queueState.currentTrack,
      upcomingTracks: upcomingTracks.value,
      sourceName: queueState.sourceName,
    },
    lyrics: {
      trackId: lyricsTrack.value?.id ?? null,
      source: lyricsSource.value,
      lines: lyricLines.value,
      activeLineIndex: activeLineIndex.value,
      offsetSeconds: lyricsState.offsetSeconds,
    },
  };
}

const projectedState = computed(() =>
  projectOutputSnapshot(projectionInput(), {
    revision: 0,
    generatedAt: PROJECTION_TIMESTAMP,
  }),
);

const publisher = createLatestAsyncPublisher(
  async (baseSnapshot) => {
    if (!state.status.running) return false;
    nextRevision += 1;
    const accepted = await bridgeMethod('publishOutputSnapshot')({
      ...baseSnapshot,
      revision: nextRevision,
      generatedAt: new Date().toISOString(),
    });
    if (!accepted && state.status.running) await refreshStatus();
    return accepted;
  },
  {
    onError: (error) => {
      state.error = `輸出狀態更新失敗：${errorMessage(error)}`;
    },
  },
);

watch(projectedState, (snapshot) => {
  if (state.status.running) publisher.request(snapshot);
});

const selectedProfile = computed(
  () =>
    state.profiles.find((profile) => profile.id === state.selectedProfileId) ??
    state.profiles[0] ??
    null,
);

async function refreshStatus() {
  try {
    applyStatus(await bridgeMethod('getOutputStatus')());
    state.error = '';
    return state.status;
  } catch (error) {
    state.error = errorMessage(error);
    return state.status;
  }
}

async function start() {
  const enabled = await requireFeatureGate(FEATURE_IDS.PUBLIC_OUTPUT_FLOW, {
    source: 'output',
    operation: 'start',
    message: '請先到設定啟用對外輸出，再建立 OBS Browser Source。',
  });
  if (!enabled) return false;

  state.isStarting = true;
  try {
    applyStatus(await bridgeMethod('startOutput')());
    state.error = '';
    publisher.request(projectedState.value);
    return true;
  } catch (error) {
    state.error = `啟動輸出失敗：${errorMessage(error)}`;
    return false;
  } finally {
    state.isStarting = false;
  }
}

async function stop() {
  state.isStopping = true;
  try {
    applyStatus(await bridgeMethod('stopOutput')());
    state.error = '';
    return true;
  } catch (error) {
    state.error = `停止輸出失敗：${errorMessage(error)}`;
    return false;
  } finally {
    state.isStopping = false;
  }
}

async function loadProfiles(seedProfile = null) {
  if (state.isLoadingProfiles) return;
  state.isLoadingProfiles = true;
  try {
    let document = await bridgeMethod('listOutputProfiles')();
    if (document.profiles?.length === 0 && seedProfile) {
      document = await bridgeMethod('upsertOutputProfile')(seedProfile);
      document = await bridgeMethod('selectOutputProfile')(seedProfile.id);
    } else if (!document.selectedProfileId && document.profiles?.[0]) {
      document = await bridgeMethod('selectOutputProfile')(
        document.profiles[0].id,
      );
    }
    applyProfiles(document);
    state.error = '';
  } catch (error) {
    state.error = `讀取輸出配置失敗：${errorMessage(error)}`;
  } finally {
    state.isLoadingProfiles = false;
  }
}

async function saveTemplateSelection(templateId, seedProfile = null) {
  const profile = selectedProfile.value ?? seedProfile;
  if (!profile || typeof templateId !== 'string') return false;

  state.isSavingProfile = true;
  try {
    let document = await bridgeMethod('upsertOutputProfile')({
      id: profile.id,
      name: profile.name,
      templateId,
      styleSetIds: profile.styleSetIds ?? [],
      settings: profile.settings ?? {},
    });
    if (document.selectedProfileId !== profile.id) {
      document = await bridgeMethod('selectOutputProfile')(profile.id);
    }
    applyProfiles(document);
    state.error = '';
    return true;
  } catch (error) {
    state.error = `保存輸出配置失敗：${errorMessage(error)}`;
    return false;
  } finally {
    state.isSavingProfile = false;
  }
}

function initialize() {
  if (initialized) return;
  initialized = true;
  refreshStatus();
}

export function useOutputRuntime() {
  return {
    state: readonly(state),
    selectedProfile,
    initialize,
    refreshStatus,
    start,
    stop,
    loadProfiles,
    saveTemplateSelection,
  };
}
