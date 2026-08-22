import { reactive, readonly } from 'vue';
import { FEATURE_IDS } from '../constants/featureGates.js';
import {
  DEFAULT_SEPARATION_PRESET_ID,
  hasSeparationPreset,
  isRunnableSeparationRecipe,
} from '../constants/separationPresets.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';

// Single shared instance (module scope, not per-component), same as
// usePlayer.js: SetlistView unmounts on every tab switch, so state that
// lived in its own refs used to vanish from the UI mid-run even though the
// worker kept going. Owning the in-flight promise and progress map here
// fixes that.
const { requireFeatureGate, requestFeatureSetup } = useFeatureGateAccess();
const { recordError } = useAppDiagnostics();

const SETUP_REQUIRED_MESSAGE = '請先到設定準備音訊處理項目';

const state = reactive({
  // trackId -> { stage, percent? }, only for tracks currently separating.
  // Cleared (not zeroed) on completion so a re-trigger starts blank rather
  // than showing the previous run's stale numbers.
  inFlight: new Map(),
  // Keyed by trackId so one track's error can't clobber another's.
  errors: new Map(),
  // Track-scoped transient selection shared by Lyrics and PlayerBar. A pending
  // preset choice must not diverge merely because the two surfaces mount at
  // different times.
  selectedPresets: new Map(),
});

let unsubscribeProgress = null;

// Subscribed once at module load, same lifetime as App.vue's composables.
if (typeof window !== 'undefined' && window.Utawakui) {
  unsubscribeProgress = window.Utawakui.onSeparationProgress(
    ({ trackId, recipeId, presetId, stage, percent }) => {
      const resolvedRecipeId = recipeId ?? presetId;
      const previous = state.inFlight.get(trackId);
      state.inFlight.set(trackId, {
        stage,
        percent: Number.isFinite(percent) ? percent : (previous?.percent ?? 0),
        presetId: resolvedRecipeId ?? previous?.presetId,
      });
      if (hasSeparationPreset(resolvedRecipeId)) {
        state.selectedPresets.set(trackId, resolvedRecipeId);
      }
    },
  );
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeProgress?.();
  });
}

function isSeparating(trackId) {
  return state.inFlight.has(trackId);
}

// Which preset is actively generating for a track, so UI that only shows a
// single preset selector (PlayerBar's dropdown) can stay pinned to it
// instead of falling back to the manifest's last-selected preset whenever
// state.track gets replaced by an unrelated library:updated refresh.
function inFlightPresetId(trackId) {
  return state.inFlight.get(trackId)?.presetId ?? null;
}

function isSelectablePresetForTrack(track, presetId) {
  return (
    hasSeparationPreset(presetId) ||
    Boolean(track?.separation?.results?.[presetId]?.legacy)
  );
}

function presetIdFor(track) {
  const inFlightPreset = track?.id ? inFlightPresetId(track.id) : null;
  if (hasSeparationPreset(inFlightPreset)) return inFlightPreset;

  const selectedPreset = track?.id ? state.selectedPresets.get(track.id) : null;
  if (hasSeparationPreset(selectedPreset)) return selectedPreset;

  const manifestPreset =
    track?.separation?.selectedRecipeId ?? track?.separation?.selectedPresetId;
  return isSelectablePresetForTrack(track, manifestPreset)
    ? manifestPreset
    : DEFAULT_SEPARATION_PRESET_ID;
}

function progressPercent(trackId) {
  const percent = state.inFlight.get(trackId)?.percent;
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent)));
}

// Human-readable label for the button — "準備中" covers the gap between
// clicking and the first progress event actually arriving, so the button
// never shows blank text.
function describe(trackId) {
  const progress = state.inFlight.get(trackId);
  if (!progress) return '準備中';
  switch (progress.stage) {
    case 'loading-model':
      return '載入模型中';
    case 'decoding':
      return '解碼中';
    case 'separating':
      return `分離中 ${progress.percent ?? 0}%`;
    case 'writing':
      return '寫入中';
    default:
      return '準備中';
  }
}

async function separate(track, presetId = DEFAULT_SEPARATION_PRESET_ID) {
  if (isSeparating(track.id)) return;
  if (!isRunnableSeparationRecipe(presetId)) return;
  state.selectedPresets.set(track.id, presetId);
  state.errors.delete(track.id);
  const enabled = await requireFeatureGate(FEATURE_IDS.AUDIO_PROCESSING_FLOW, {
    source: 'separation',
    operation: 'run',
    message: '請先到設定啟用音訊處理，並準備需要的工具與模型後再產生分離結果。',
  });
  if (!enabled) {
    const appError = recordError('請先到設定啟用音訊處理', {
      code: 'FEATURE_GATE_REQUIRED',
      severity: 'warning',
      title: '需要啟用音訊處理',
      source: 'separation',
      operation: 'run',
      message: '請先到設定啟用音訊處理。',
      context: { trackId: track.id, presetId },
    });
    state.errors.set(track.id, appError.message);
    return;
  }

  // Seeds an entry immediately so isSeparating() is true (and the button
  // shows "準備中") from the very first render after the click, instead of
  // waiting for the first IPC progress event to round-trip.
  state.inFlight.set(track.id, { stage: null, percent: 0, presetId });
  try {
    await window.Utawakui.runSeparation(track.id, presetId);
  } catch (err) {
    const appError = recordError(err, {
      title: `${track.title} 分離失敗`,
      message: '人聲分離未完成，請再試一次。',
      source: 'separation',
      operation: 'run',
      context: { trackId: track.id, presetId },
    });
    if (
      appError.code === 'FEATURE_DEPENDENCY_MISSING' &&
      appError.context.featureId === FEATURE_IDS.AUDIO_PROCESSING_FLOW
    ) {
      requestFeatureSetup(FEATURE_IDS.AUDIO_PROCESSING_FLOW, {
        title: '需要準備音訊處理項目',
        message: SETUP_REQUIRED_MESSAGE,
        source: 'separation',
        operation: 'run',
        context: {
          trackId: track.id,
          presetId,
          dependencyId: appError.context.dependencyId,
        },
      });
      state.errors.set(track.id, SETUP_REQUIRED_MESSAGE);
      return;
    }
    state.errors.set(track.id, appError.message);
  } finally {
    state.inFlight.delete(track.id);
  }
}

// Switches which already-produced result plays — instant, no DSP, so no
// inFlight/isSeparating bookkeeping needed. Still records a failure (e.g.
// a preset that was produced then deleted out-of-band) the same way
// separate() does, so the UI can surface it consistently.
async function selectResult(track, presetId) {
  try {
    await window.Utawakui.selectSeparationResult(track.id, presetId);
    if (isSelectablePresetForTrack(track, presetId)) {
      state.selectedPresets.set(track.id, presetId);
    }
    state.errors.delete(track.id);
    return true;
  } catch (err) {
    const appError = recordError(err, {
      title: `${track.title} 切換失敗`,
      message: '分離版本未切換，請再試一次。',
      source: 'separation',
      operation: 'select-result',
      context: { trackId: track.id, presetId },
    });
    state.errors.set(track.id, appError.message);
    return false;
  }
}

async function selectPreset(track, presetId) {
  if (!track || !isSelectablePresetForTrack(track, presetId)) return;
  if (track.separation?.results?.[presetId]) {
    await selectResult(track, presetId);
    return;
  }
  if (!isRunnableSeparationRecipe(presetId)) return;
  state.selectedPresets.set(track.id, presetId);
}

export function useSeparation() {
  return {
    state: readonly(state),
    isSeparating,
    inFlightPresetId,
    presetIdFor,
    progressPercent,
    describe,
    separate,
    selectPreset,
    selectResult,
  };
}
