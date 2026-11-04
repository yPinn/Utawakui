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
import { t } from '../utils/i18n.js';

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
  'duplicate-content': t('import.local.skipReasons.duplicateContent'),
  'unsupported-extension': t('import.local.skipReasons.unsupportedExtension'),
  'unsupported-codec': t('import.local.skipReasons.unsupportedCodec'),
  'unsupported-media': t('import.local.skipReasons.unsupportedMedia'),
  'missing-file': t('import.local.skipReasons.missingFile'),
  'not-a-file': t('import.local.skipReasons.notAFile'),
  'invalid-path': t('import.local.skipReasons.invalidPath'),
  'invalid-audio': t('import.local.skipReasons.invalidAudio'),
  'format-mismatch': t('import.local.skipReasons.formatMismatch'),
  'source-changed': t('import.local.skipReasons.sourceChanged'),
  'conversion-failed': t('import.local.skipReasons.conversionFailed'),
  'import-failed': t('import.local.skipReasons.importFailed'),
});
const skippedResults = computed(() =>
  state.skipped.map((item) => ({
    filename: item.filename,
    message: SKIP_REASONS[item.reason] ?? t('import.local.skipUnknown'),
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
  const title = t(
    !conversion && state.conversionReview
      ? 'import.local.titles.needsConversion'
      : conversion
        ? error
          ? 'import.local.titles.conversionFailed'
          : 'import.local.titles.conversionDone'
        : error
          ? 'import.local.titles.importFailed'
          : 'import.local.titles.importDone',
  );
  let tone = state.statusType === 'idle' ? 'info' : 'success';
  if (needsAttention) tone = 'warning';
  if (error) tone = 'danger';
  const persistent = Boolean(error || needsAttention);
  notifications.notify({
    key: RESULT_KEY,
    title,
    message: state.message,
    tone,
    lifecycle: persistent ? 'persistent' : 'transient',
    // Transient results carry no action; the Import tab keeps the details.
    ...(persistent && {
      actionLabel: t('import.local.viewResults'),
      action() {
        const dock = useAppRightDock();
        dock.selectPreparationTab('import');
        dock.showSurface(RIGHT_DOCK_SURFACE_PREPARATION);
      },
    }),
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
  return t(
    'import.local.conversionReview',
    { count: files.length, formats: labels.join(t('common.listSeparator')) },
    files.length,
  );
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
    return t(
      'import.local.skipped.duplicates',
      { count: duplicateCount },
      duplicateCount,
    );
  }
  if (duplicateCount > 0) {
    return t('import.local.skipped.duplicatesAndOthers', {
      duplicates: duplicateCount,
      others: otherCount,
    });
  }
  return t(
    'import.local.skipped.any',
    { count: skipped.length },
    skipped.length,
  );
}

function compatibilityFailureMessage(skipped) {
  if (skipped.every((item) => item?.reason === 'unsupported-codec')) {
    return t(
      'import.local.codecOnly',
      { count: skipped.length },
      skipped.length,
    );
  }
  if (skipped.every((item) => item?.reason === 'unsupported-media')) {
    return t(
      'import.local.mediaOnly',
      { count: skipped.length },
      skipped.length,
    );
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
      ? t('import.local.copiedNeedsConversion', {
          count: imported.length,
          files: conversionReview.files.length,
        })
      : t(
          'import.local.needsConversionCount',
          { count: conversionReview.files.length },
          conversionReview.files.length,
        );
    return;
  }

  if (imported.length === 0 && skipped.length === 0) {
    state.statusType = 'idle';
    state.message = t('import.local.noneSelected');
    return;
  }

  if (imported.length > 0) {
    state.statusType = 'success';
    state.message =
      skipped.length > 0
        ? t('import.local.copiedWithSkipped', {
            count: imported.length,
            skipped: skippedLabel(skipped),
          })
        : t('import.local.copied', { count: imported.length }, imported.length);
    return;
  }

  if (skipped.length === duplicateSkipCount(skipped)) {
    state.statusType = 'idle';
    state.message = t('import.local.noneAddedSkipped', {
      skipped: skippedLabel(skipped),
    });
    return;
  }

  state.statusType = 'error';
  state.message =
    compatibilityFailureMessage(skipped) ||
    t('import.local.noneImportableSkipped', { skipped: skippedLabel(skipped) });
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
      ? t('import.local.convertedWithSkipped', {
          count: imported.length,
          skipped: skippedLabel(skipped),
        })
      : t('import.local.converted', { count: imported.length });
    return;
  }
  if (skipped.length > 0 && skipped.length === duplicateSkipCount(skipped)) {
    state.statusType = 'idle';
    state.message = t('import.local.noneAddedSkipped', {
      skipped: skippedLabel(skipped),
    });
    return;
  }
  state.statusType = 'error';
  state.message = skipped.length
    ? t('import.local.conversionNoneSkipped', {
        skipped: skippedLabel(skipped),
      })
    : t('import.local.conversionNone');
}

async function importFiles() {
  if (state.isImporting || state.isConverting) return;
  if (
    typeof window === 'undefined' ||
    typeof window.Utawakui?.importLocalAudioFiles !== 'function'
  ) {
    state.statusType = 'error';
    state.message = t('import.local.restartImport');
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
      title: t('import.local.failedTitle'),
      message: t('import.local.failedMessage'),
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
    state.message = t('import.local.restartConversion');
    notifyResult(true);
    return;
  }

  state.isConverting = true;
  try {
    const enabled = await requireFeatureGate(
      FEATURE_IDS.AUDIO_PROCESSING_FLOW,
      {
        title: t('import.local.needsAudioTitle'),
        message: t('import.local.needsAudioMessage'),
        source: 'local-import',
        operation: 'compatibility-conversion',
      },
    );
    if (!enabled) {
      state.statusType = 'pending';
      state.message = t('import.local.needsAudioStatus');
      return;
    }

    state.summaryNotified = false;
    notifications.clear(RESULT_KEY);
    state.statusType = 'pending';
    state.message = t('import.local.converting');
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
        title: t('import.local.needsFfmpegTitle'),
        message: t('import.local.needsFfmpegMessage'),
        source: 'local-import',
        operation: 'compatibility-conversion',
        context: {
          dependencyId: appError.context.dependencyId,
        },
      });
      state.statusType = 'pending';
      state.message = t('import.local.needsFfmpegMessage');
      return;
    }

    state.conversionReview = null;
    state.statusType = 'error';
    state.message = recordError(err, {
      code: 'LOCAL_IMPORT_CONVERSION_FAILED',
      title: t('import.local.conversionFailedTitle'),
      message: t('import.local.conversionFailedMessage'),
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
