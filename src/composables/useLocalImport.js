import { computed, reactive, readonly } from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import { FEATURE_IDS } from '../constants/featureGates.js';
import { normalizeAppError } from '../utils/appErrors.js';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useLibrary } from './useLibrary.js';
import { registerLocalImportActivity } from './usePreparationActivity.js';
import { useAppNotifications } from './useAppNotifications.js';
import {
  RIGHT_DOCK_SURFACE_PREPARATION,
  useAppRightDock,
} from './useAppRightDock.js';

const CONVERSION_FORMAT_LABELS = Object.freeze({
  aiff: 'AIFF',
  alac: 'ALAC',
  ape: "Monkey's Audio",
  caf: 'CAF',
  wavpack: 'WavPack',
  wma: 'WMA',
});
const REVIEW_SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const state = reactive({
  isImporting: false,
  isConverting: false,
  statusType: 'idle',
  message: '',
  imported: [],
  skipped: [],
  conversionReview: null,
  summaryNotified: false,
});
const readonlyState = readonly(state);
registerLocalImportActivity(readonlyState);

const { refresh: refreshLibrary } = useLibrary();
const { recordError } = useAppDiagnostics();
const { requireFeatureGate, requestFeatureSetup } = useFeatureGateAccess();
const notifications = useAppNotifications();
const RESULT_KEY = NOTIFICATION_KEYS.LOCAL_IMPORT_RESULT;
const SKIP_REASONS = Object.freeze({
  'duplicate-content': '曲庫已有相同音訊',
  'unsupported-extension': '不支援此檔案格式',
  'unsupported-codec': '目前無法直接播放此編碼',
  'unsupported-media': '包含不支援的媒體串流',
  'missing-file': '找不到檔案',
  'not-a-file': '不是音訊檔案',
  'invalid-path': '無法讀取檔案',
  'invalid-audio': '無法讀取音訊內容',
  'format-mismatch': '檔案格式與內容不符',
  'source-changed': '來源檔案已變更，請重新選取',
  'conversion-failed': '相容轉檔未完成',
  'import-failed': '匯入未完成',
});
const skippedResults = computed(() =>
  state.skipped.map((item) => ({
    filename: item.filename,
    message: SKIP_REASONS[item.reason] ?? '無法匯入此檔案',
  })),
);

// The open import tab already shows the review with its convert action.
function importTabVisible() {
  const dock = useAppRightDock();
  return (
    dock.isExpanded.value &&
    dock.topSurface.value === RIGHT_DOCK_SURFACE_PREPARATION &&
    dock.preparationTab.value === 'import'
  );
}

function notifyResult(conversion = false) {
  if (state.statusType === 'pending' && !state.conversionReview) return;
  if (
    !state.imported.length &&
    !state.skipped.length &&
    !state.conversionReview &&
    state.statusType !== 'error'
  )
    return;
  if (
    !conversion &&
    state.conversionReview &&
    !state.imported.length &&
    !state.skipped.length &&
    importTabVisible()
  ) {
    notifications.clear(RESULT_KEY);
    return;
  }
  const error = state.statusType === 'error';
  const needsAttention =
    state.skipped.some((item) => item.reason !== 'duplicate-content') ||
    Boolean(state.conversionReview);
  const taskLabel = conversion ? '相容轉檔' : '本機匯入';
  const title =
    !conversion && state.conversionReview
      ? '需要相容轉檔'
      : `${taskLabel}${error ? '未完成' : '完成'}`;
  let tone = state.statusType === 'idle' ? 'info' : 'success';
  if (needsAttention) tone = 'warning';
  if (error) tone = 'danger';
  notifications.notify({
    key: RESULT_KEY,
    title,
    message: state.message,
    tone,
    lifecycle: error || needsAttention ? 'persistent' : 'transient',
    actionLabel: '查看匯入結果',
    action() {
      const dock = useAppRightDock();
      dock.selectPreparationTab('import');
      dock.showSurface(RIGHT_DOCK_SURFACE_PREPARATION);
    },
  });
  state.summaryNotified = true;
}

const conversionReviewMessage = computed(() => {
  const files = state.conversionReview?.files || [];
  if (files.length === 0) return '';
  const labels = [
    ...new Set(
      files
        .map(({ sourceFormat }) => CONVERSION_FORMAT_LABELS[sourceFormat])
        .filter(Boolean),
    ),
  ];
  return `${files.length} 個 ${labels.join('、')} 檔案需要轉成 FLAC；原檔不會修改，轉換副本可能使用較多空間。`;
});

function normalizedConversionReview(review) {
  if (
    !review ||
    typeof review.sessionId !== 'string' ||
    !REVIEW_SESSION_ID_RE.test(review.sessionId) ||
    !Array.isArray(review.files)
  ) {
    return null;
  }
  const files = review.files
    .filter(
      (file) =>
        typeof file?.filename === 'string' &&
        Object.hasOwn(CONVERSION_FORMAT_LABELS, file.sourceFormat),
    )
    .map(({ filename, sourceFormat }) => ({
      filename: filename.trim().slice(0, 255),
      sourceFormat,
    }))
    .filter(({ filename }) => filename.length > 0);
  return files.length > 0 ? { sessionId: review.sessionId, files } : null;
}

function duplicateSkipCount(skipped) {
  return skipped.filter((item) => item?.reason === 'duplicate-content').length;
}

function skippedLabel(skipped) {
  const duplicateCount = duplicateSkipCount(skipped);
  const otherCount = skipped.length - duplicateCount;
  if (duplicateCount > 0 && otherCount === 0) {
    return `略過 ${duplicateCount} 個重複檔案`;
  }
  if (duplicateCount > 0) {
    return `略過 ${duplicateCount} 個重複、${otherCount} 個檔案`;
  }
  return `略過 ${skipped.length} 個檔案`;
}

function compatibilityFailureMessage(skipped) {
  if (skipped.every((item) => item?.reason === 'unsupported-codec')) {
    return `沒有可匯入的音訊檔；${skipped.length} 個檔案使用目前無法直接播放的編碼。`;
  }
  if (skipped.every((item) => item?.reason === 'unsupported-media')) {
    return `沒有可匯入的音訊檔；${skipped.length} 個檔案包含影片或其他不支援的媒體串流。`;
  }
  return '';
}

function setResult(result) {
  const imported = Array.isArray(result?.imported) ? result.imported : [];
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
  const conversionReview = normalizedConversionReview(result?.conversionReview);
  state.imported = imported;
  state.skipped = skipped;
  state.conversionReview = conversionReview;

  if (conversionReview) {
    state.statusType = imported.length > 0 ? 'success' : 'pending';
    state.message = imported.length
      ? `已複製 ${imported.length} 首；另有 ${conversionReview.files.length} 個檔案需要相容轉檔`
      : `${conversionReview.files.length} 個檔案需要相容轉檔`;
    return;
  }

  if (imported.length === 0 && skipped.length === 0) {
    state.statusType = 'idle';
    state.message = '沒有選取音訊檔';
    return;
  }

  if (imported.length > 0) {
    state.statusType = 'success';
    state.message =
      skipped.length > 0
        ? `已複製 ${imported.length} 首，${skippedLabel(skipped)}`
        : `已複製 ${imported.length} 首`;
    return;
  }

  if (skipped.length === duplicateSkipCount(skipped)) {
    state.statusType = 'idle';
    state.message = `沒有新增曲目，${skippedLabel(skipped)}`;
    return;
  }

  state.statusType = 'error';
  state.message =
    compatibilityFailureMessage(skipped) ||
    `沒有可匯入的音訊檔，${skippedLabel(skipped)}`;
}

function setConversionResult(result) {
  const imported = Array.isArray(result?.imported) ? result.imported : [];
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
  state.imported = [...state.imported, ...imported];
  state.skipped = skipped;
  state.conversionReview = null;

  if (imported.length > 0) {
    state.statusType = 'success';
    state.message = skipped.length
      ? `已轉換並匯入 ${imported.length} 首，${skippedLabel(skipped)}`
      : `已轉換並匯入 ${imported.length} 首`;
    return;
  }
  if (skipped.length > 0 && skipped.length === duplicateSkipCount(skipped)) {
    state.statusType = 'idle';
    state.message = `沒有新增曲目，${skippedLabel(skipped)}`;
    return;
  }
  state.statusType = 'error';
  state.message = skipped.length
    ? `沒有完成相容轉檔，${skippedLabel(skipped)}`
    : '沒有完成相容轉檔，請重新選擇檔案。';
}

async function importFiles() {
  if (state.isImporting || state.isConverting) return;
  if (
    typeof window === 'undefined' ||
    typeof window.Utawakui?.importLocalAudioFiles !== 'function'
  ) {
    state.statusType = 'error';
    state.message = '需要重新啟動應用程式才能使用本機音訊匯入。';
    notifyResult();
    return;
  }

  state.isImporting = true;
  state.statusType = 'idle';
  state.message = '';
  state.summaryNotified = false;
  notifications.clear(RESULT_KEY);
  try {
    const result = await window.Utawakui.importLocalAudioFiles();
    setResult(result);
    notifyResult();
    if (state.imported.length > 0) await refreshLibrary();
  } catch (err) {
    state.statusType = 'error';
    state.message = recordError(err, {
      code: 'LOCAL_IMPORT_FAILED',
      title: '本機匯入失敗',
      message: '目前無法匯入音訊檔，請再試一次。',
      source: 'local-import',
      operation: 'import',
      context: { retryable: true },
    }).message;
    notifyResult();
  } finally {
    state.isImporting = false;
  }
}

async function convertPendingFiles() {
  if (state.isImporting || state.isConverting || !state.conversionReview)
    return;
  if (
    typeof window === 'undefined' ||
    typeof window.Utawakui?.convertLocalAudioFiles !== 'function'
  ) {
    state.statusType = 'error';
    state.message = '需要重新啟動應用程式才能使用相容轉檔。';
    notifyResult(true);
    return;
  }

  state.isConverting = true;
  try {
    const enabled = await requireFeatureGate(
      FEATURE_IDS.AUDIO_PROCESSING_FLOW,
      {
        title: '需要啟用音訊處理',
        message: '相容轉檔會在本機建立 FLAC 副本，請先查看並啟用音訊處理。',
        source: 'local-import',
        operation: 'compatibility-conversion',
      },
    );
    if (!enabled) {
      state.statusType = 'pending';
      state.message = '請先在設定啟用音訊處理，再回來執行相容轉檔。';
      return;
    }

    state.summaryNotified = false;
    notifications.clear(RESULT_KEY);
    state.statusType = 'pending';
    state.message = '正在建立 FLAC 相容副本…';
    const result = await window.Utawakui.convertLocalAudioFiles(
      state.conversionReview.sessionId,
    );
    setConversionResult(result);
    notifyResult(true);
    if (Array.isArray(result?.imported) && result.imported.length > 0) {
      await refreshLibrary();
    }
  } catch (err) {
    const appError = normalizeAppError(err, {
      source: 'local-import',
      operation: 'compatibility-conversion',
    });
    if (appError.code === 'FEATURE_DEPENDENCY_MISSING') {
      requestFeatureSetup(FEATURE_IDS.AUDIO_PROCESSING_FLOW, {
        title: '需要準備 FFmpeg',
        message: '請先在設定準備 FFmpeg，再回來執行相容轉檔。',
        source: 'local-import',
        operation: 'compatibility-conversion',
        context: {
          dependencyId: appError.context.dependencyId,
        },
      });
      state.statusType = 'pending';
      state.message = '請先在設定準備 FFmpeg，再回來執行相容轉檔。';
      return;
    }

    state.conversionReview = null;
    state.statusType = 'error';
    state.message = recordError(err, {
      code: 'LOCAL_IMPORT_CONVERSION_FAILED',
      title: '相容轉檔失敗',
      message: '相容轉檔未完成，請重新選擇檔案後再試一次。',
      source: 'local-import',
      operation: 'compatibility-conversion',
      context: { retryable: true },
    }).message;
    notifyResult(true);
  } finally {
    state.isConverting = false;
  }
}

export function useLocalImport() {
  return {
    state: readonlyState,
    conversionReviewMessage,
    skippedResults,
    convertPendingFiles,
    importFiles,
  };
}
