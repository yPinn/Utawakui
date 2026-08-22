import { reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useLibrary } from './useLibrary.js';

const state = reactive({
  isImporting: false,
  statusType: 'idle',
  message: '',
  imported: [],
  skipped: [],
});

const { refresh: refreshLibrary } = useLibrary();
const { recordError } = useAppDiagnostics();

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

function setResult(result) {
  const imported = Array.isArray(result?.imported) ? result.imported : [];
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
  state.imported = imported;
  state.skipped = skipped;

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
  state.message = `沒有可匯入的音訊檔，${skippedLabel(skipped)}`;
}

async function importFiles() {
  if (state.isImporting) return;
  if (
    typeof window === 'undefined' ||
    typeof window.Utawakui?.importLocalAudioFiles !== 'function'
  ) {
    state.statusType = 'error';
    state.message = '需要重新啟動應用程式才能使用本機音訊匯入。';
    return;
  }

  state.isImporting = true;
  state.statusType = 'idle';
  state.message = '';
  try {
    const result = await window.Utawakui.importLocalAudioFiles();
    setResult(result);
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
  } finally {
    state.isImporting = false;
  }
}

export function useLocalImport() {
  return {
    state: readonly(state),
    importFiles,
  };
}
