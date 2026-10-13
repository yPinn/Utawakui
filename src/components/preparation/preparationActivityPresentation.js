import { separationQueueIndicator } from '../separation/separationQueuePresentation.js';

function nonNegativeCount(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function providerFailureCount(providerImport) {
  const playlistFailures = Array.isArray(providerImport?.playlistTracks)
    ? providerImport.playlistTracks.filter(({ status }) => status === 'error')
        .length
    : 0;
  const singleFailure = providerImport?.singleTrack?.status === 'error' ? 1 : 0;
  return playlistFailures + singleFailure;
}

export function preparationActivityIndicator({
  separationQueue = null,
  providerImport = null,
  localImport = null,
} = {}) {
  const separationFailures =
    nonNegativeCount(separationQueue?.failed) +
    nonNegativeCount(separationQueue?.cancelled);
  const providerFailures = providerFailureCount(providerImport);
  const localFailure = localImport?.statusType === 'error';
  const attentionDomains = [
    separationFailures > 0,
    providerFailures > 0,
    localFailure,
  ].filter(Boolean).length;

  if (attentionDomains > 1) {
    return { state: 'attention', label: '有未完成項目' };
  }
  if (providerFailures > 0 || localFailure) {
    return { state: 'attention', label: '匯入未完成' };
  }
  if (separationFailures > 0) {
    return {
      state: 'attention',
      label: `${separationFailures} 首未完成`,
    };
  }

  const importRunning = Boolean(
    providerImport?.isImporting ||
    localImport?.isImporting ||
    localImport?.isConverting,
  );
  const separation = separationQueueIndicator(separationQueue);
  const separationRunning = ['running', 'pausing'].includes(separation.state);

  if (importRunning && separationRunning) {
    return { state: 'running', label: '多項處理中' };
  }
  if (importRunning) {
    return { state: 'running', label: '匯入中' };
  }
  return separation;
}
