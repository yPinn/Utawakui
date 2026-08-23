import { computed, reactive, readonly } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { useLibrary } from './useLibrary.js';

function boundedCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeSummary(result = {}) {
  return {
    updated: boundedCount(result.updated),
    normalized: boundedCount(result.normalized),
    enriched: boundedCount(result.enriched),
    skipped: boundedCount(result.skipped),
  };
}

export function useLibraryMetadataMaintenance(options = {}) {
  const refreshMetadata =
    options.refreshMetadata || useLibrary().refreshMetadata;
  const recordError = options.recordError || useAppDiagnostics().recordError;
  const state = reactive({
    isRunning: false,
    result: null,
    error: null,
  });

  const message = computed(() => {
    const result = state.result;
    if (!result) return '';
    if (result.updated === 0 && result.skipped === 0) {
      return '沒有需要整理的資訊';
    }

    const parts = [];
    if (result.updated > 0) {
      parts.push(
        `已整理 ${result.updated} 首曲目（名稱或歌手 ${result.normalized} 首、其他資訊 ${result.enriched} 首）`,
      );
    } else {
      parts.push('沒有自動變更');
    }
    if (result.skipped > 0) {
      parts.push(`略過 ${result.skipped} 首手動或不確定內容`);
    }
    return parts.join('；');
  });

  async function run() {
    if (state.isRunning) return state.result;
    state.isRunning = true;
    state.result = null;
    state.error = null;
    try {
      state.result = normalizeSummary(await refreshMetadata());
      return state.result;
    } catch (error) {
      state.error = recordError(error, {
        code: 'LIBRARY_METADATA_REFRESH_FAILED',
        title: '曲目資訊整理未完成',
        message: '目前無法整理曲目資訊，請再試一次。',
        source: 'settings',
        operation: 'refresh-library-metadata',
        context: { retryable: true },
      });
      return null;
    } finally {
      state.isRunning = false;
    }
  }

  return {
    state: readonly(state),
    message,
    run,
  };
}
