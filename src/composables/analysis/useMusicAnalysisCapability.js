import { computed } from 'vue';

const CAPABILITY_STAGE_LABELS = Object.freeze({
  starting: '準備下載',
  'downloading-runtime': '下載分析元件',
  'installing-runtime': '安裝分析元件',
  'downloading-environment': '下載分析元件',
  'installing-environment': '安裝分析元件',
  'verifying-environment': '確認分析元件',
  'downloading-model': '下載分析元件',
  'verifying-model': '確認分析元件',
  activating: '完成分析功能設定',
  ready: '分析功能已就緒',
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
  if (operation === 'repair') return '分析功能修復未完成，請再試一次。';
  if (operation === 'remove') return '分析功能移除未完成，請再試一次。';
  return '分析功能安裝未完成，請檢查網路連線後再試一次。';
}

export function useMusicAnalysisCapability(options = {}) {
  const { state, capability, bridge, isBatchActive = () => false } = options;
  let unsubscribeProgress = null;
  let disposed = false;

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
    if (stage) return CAPABILITY_STAGE_LABELS[stage] ?? '準備分析功能';
    if (capability.value?.status === 'ready') return '分析功能已就緒';
    if (capability.value?.status === 'damaged') return '分析功能需要修復';
    if (capability.value?.status === 'unavailable')
      return '目前無法管理分析功能';
    return '尚未安裝分析功能';
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
  }

  function subscribeProgress() {
    if (!bridge || disposed || unsubscribeProgress) return;
    unsubscribeProgress =
      bridge.onMusicStructureCapabilityProgress?.(handleProgress) ?? null;
  }

  async function refreshStatus() {
    if (typeof bridge?.getMusicStructureCapabilityStatus !== 'function') {
      capability.value = unavailableCapability();
      return capability.value;
    }
    try {
      capability.value = await bridge.getMusicStructureCapabilityStatus();
      state.capabilityError = '';
    } catch {
      state.capabilityError = '目前無法讀取分析功能狀態，請重新啟動後再試。';
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
    state.capabilityError = '';
    state.capabilityProgress = { stage: 'starting', percent: 0 };
    try {
      capability.value = await bridge[bridgeMethod]();
      state.capabilityProgress = capability.value?.installed
        ? { stage: 'ready', percent: 100 }
        : null;
      return capability.value;
    } catch {
      state.capabilityError = capabilityErrorMessage(operation);
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
