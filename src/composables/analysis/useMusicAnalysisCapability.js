import { computed, shallowRef } from 'vue';
import { t } from '../../utils/i18n.js';

const CAPABILITY_STAGE_LABELS = Object.freeze({
  starting: t('prep.analysis.starting'),
  'downloading-runtime': t('prep.analysis.downloading'),
  'installing-runtime': t('prep.analysis.installing'),
  'downloading-environment': t('prep.analysis.downloading'),
  'installing-environment': t('prep.analysis.installing'),
  'verifying-environment': t('prep.analysis.verifying'),
  'downloading-model': t('prep.analysis.downloading'),
  'verifying-model': t('prep.analysis.verifying'),
  activating: t('prep.analysis.activating'),
  ready: t('prep.analysis.ready'),
});

function unavailableCapability() {
  return {
    status: 'unavailable',
    installed: false,
    busy: false,
    canPrepare: false,
    canRepair: false,
    canRemove: false,
    modelName: 'Beat This! small0',
    modelVersion: '1.1.0',
    downloadBytes: 0,
    installedBytesEstimate: 0,
  };
}

function capabilityErrorMessage(operation) {
  if (operation === 'repair') return t('prep.analysis.repairFailed');
  if (operation === 'remove') return t('prep.analysis.removeFailed');
  return t('prep.analysis.installFailed');
}

export function useMusicAnalysisCapability(options = {}) {
  const { state, capability, bridge, isBatchActive = () => false } = options;
  const readError = shallowRef('');
  const errorOperation = shallowRef('');
  let unsubscribeProgress = null;
  let disposed = false;
  let revision = 0;

  const ready = computed(
    () =>
      capability.value?.status === 'ready' &&
      capability.value?.installed === true,
  );
  const busy = computed(() => state.capabilityBusy);
  const progressPercent = computed(() =>
    Number.isFinite(state.capabilityProgress?.percent)
      ? state.capabilityProgress.percent
      : null,
  );
  const stageLabel = computed(() => {
    const stage = state.capabilityProgress?.stage;
    if (stage)
      return CAPABILITY_STAGE_LABELS[stage] ?? t('prep.analysis.preparing');
    if (capability.value?.status === 'ready') return t('prep.analysis.ready');
    if (capability.value?.status === 'damaged')
      return t('prep.analysis.damaged');
    if (capability.value?.status === 'unavailable')
      return t('prep.analysis.unmanageable');
    return t('prep.analysis.missing');
  });

  function handleProgress(payload) {
    if (
      disposed ||
      !payload ||
      typeof payload.stage !== 'string' ||
      (payload.percent !== undefined && !Number.isFinite(payload.percent))
    ) {
      return;
    }
    state.capabilityProgress = {
      stage: payload.stage,
      ...(Number.isFinite(payload.percent)
        ? { percent: Math.min(100, Math.max(0, payload.percent)) }
        : {}),
    };
    options.onProgress?.();
  }

  function subscribeProgress() {
    if (!bridge || disposed || unsubscribeProgress) return;
    unsubscribeProgress =
      bridge.onMusicStructureCapabilityProgress?.(handleProgress) ?? null;
  }

  async function refreshStatus() {
    if (state.capabilityBusy) return capability.value;
    const current = ++revision;
    if (typeof bridge?.getMusicStructureCapabilityStatus !== 'function') {
      capability.value = unavailableCapability();
      readError.value = t('prep.analysis.readFailedRestart');
      return capability.value;
    }
    try {
      const status = await bridge.getMusicStructureCapabilityStatus();
      if (!status || typeof status.status !== 'string')
        throw new TypeError('invalid capability status');
      if (current !== revision) return capability.value;
      capability.value = status;
      readError.value = '';
      if (errorOperation.value === 'read') state.capabilityError = '';
    } catch {
      if (current !== revision) return capability.value;
      readError.value = t('prep.analysis.readFailed');
      if (!state.capabilityError || errorOperation.value === 'read') {
        state.capabilityError = readError.value;
        errorOperation.value = 'read';
      }
    }
    return capability.value;
  }

  async function runAction(operation, bridgeMethod) {
    if (
      state.capabilityBusy ||
      isBatchActive() ||
      typeof bridge?.[bridgeMethod] !== 'function'
    ) {
      return null;
    }
    state.capabilityBusy = true;
    revision += 1;
    subscribeProgress();
    state.capabilityProgress = { stage: 'starting', percent: 0 };
    options.onActionStart?.(operation);
    try {
      capability.value = await bridge[bridgeMethod]();
      state.capabilityError = '';
      readError.value = '';
      errorOperation.value = '';
      state.capabilityProgress = capability.value?.installed
        ? { stage: 'ready', percent: 100 }
        : null;
      options.onActionComplete?.(operation, capability.value);
      return capability.value;
    } catch {
      state.capabilityError = capabilityErrorMessage(operation);
      errorOperation.value = operation;
      options.onActionError?.(operation, state.capabilityError);
      return null;
    } finally {
      state.capabilityBusy = false;
    }
  }

  function prepare() {
    return runAction('prepare', 'prepareMusicStructureCapability');
  }

  function repair() {
    return runAction('repair', 'repairMusicStructureCapability');
  }

  function remove() {
    return runAction('remove', 'removeMusicStructureCapability');
  }

  function dispose() {
    disposed = true;
    unsubscribeProgress?.();
    unsubscribeProgress = null;
  }

  return {
    ready,
    busy,
    readError,
    error: computed(() =>
      errorOperation.value === 'read' ? '' : state.capabilityError,
    ),
    progressPercent,
    stageLabel,
    subscribeProgress,
    refreshStatus,
    prepare,
    repair,
    remove,
    dispose,
  };
}
