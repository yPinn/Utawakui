import { computed, shallowRef } from 'vue';
import {
  CircleAlert,
  Cpu,
  Download,
  ListChecks,
  RefreshCw,
  Settings,
  Trash2,
  Wrench,
} from '../icons/index.js';
import {
  FEATURE_DEPENDENCY_IDS,
  getFeatureDependencies,
} from '../constants/featureDependencies.js';
import { FEATURE_GATES } from '../constants/featureGates.js';
import { useFeatureDependencies } from './useFeatureDependencies.js';
import { useFeatureGateAccess } from './useFeatureGateAccess.js';
import { useFeatureGates } from './useFeatureGates.js';

// Feature-gate/dependency row presentation for SettingsView.vue — pure
// data-shaping (labels, status/tone, workflow-item assembly) that has no
// template ref or lifecycle dependency, split out of the view so the view
// stays interaction/template glue. A per-call factory, not a module-scope
// singleton like useFeatureDependencies.js — those own IPC subscriptions
// that must survive view unmount, this is per-view UI state and SettingsView
// unmounts on every tab switch (see CLAUDE.md's App shell section), so a
// singleton here would be the wrong lifetime.
// systemFfmpegDetection is a caller-supplied ref holding the last result of
// window.Utawakui.detectSystemFfmpeg() (SettingsView.vue runs one probe on
// mount). It only feeds the compact row's "可用系統版本" hint; the full
// detection detail (path, smoke-test failure reason, a manual re-detect)
// lives in FfmpegSourceModal.vue's own local state, not here.
export function useFeatureGatePresentation({ systemFfmpegDetection } = {}) {
  const {
    state: featureGateState,
    isFeatureEnabled,
    ensureFeatureGate,
  } = useFeatureGates();
  const { clearFeatureGateRequest } = useFeatureGateAccess();
  const { state: featureDependencyState } = useFeatureDependencies();

  const enablingFeatureId = shallowRef(null);

  const FEATURE_GATE_LABELS = {
    'provider-flow': '外部來源',
    'lyrics-flow': '歌詞來源',
    'audio-processing-flow': '音訊處理',
    'public-output-flow': '對外輸出',
  };

  const DEPENDENCY_ADVANCED_ACTIONS = Object.freeze({
    REFRESH: 'refresh',
    REPAIR: 'repair',
    REMOVE: 'remove',
  });

  const DEPENDENCY_PROGRESS_LABELS = Object.freeze({
    starting: '準備中',
    downloading: '下載中',
    verifying: '驗證中',
    installing: '安裝中',
    ready: '完成',
  });

  function isDependencyActionRunning(dependencyId, action) {
    return featureDependencyState.actionIds.has(`${action}:${dependencyId}`);
  }

  function dependencyValueLabel(dependency) {
    if (
      dependency.id === FEATURE_DEPENDENCY_IDS.FFMPEG_GYAN_ESSENTIALS &&
      dependency.source === 'system'
    ) {
      return '使用系統安裝版本';
    }
    if (dependency.id === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL) {
      return '保存外部來源到本機曲庫';
    }
    if (dependency.id === FEATURE_DEPENDENCY_IDS.FFMPEG_GYAN_ESSENTIALS) {
      return '支援音訊轉換與格式讀取';
    }
    if (dependency.kind === 'model') return '產生人聲分離結果時使用';
    return dependency.name || '';
  }

  function dependencyAdvancedActions({ dependency, installed, preparing }) {
    const isYtdlp =
      dependency.id === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL;
    const isRemoving = isDependencyActionRunning(
      dependency.id,
      DEPENDENCY_ADVANCED_ACTIONS.REMOVE,
    );
    const isRepairing = isDependencyActionRunning(
      dependency.id,
      DEPENDENCY_ADVANCED_ACTIONS.REPAIR,
    );
    const isBusy = preparing || isRemoving || isRepairing;

    return [
      {
        id: DEPENDENCY_ADVANCED_ACTIONS.REFRESH,
        icon: RefreshCw,
        label: '重新檢查',
        disabled: featureDependencyState.isLoading || isBusy,
      },
      ...(installed
        ? [
            {
              id: DEPENDENCY_ADVANCED_ACTIONS.REPAIR,
              icon: isYtdlp ? Download : Wrench,
              label: isRepairing
                ? isYtdlp
                  ? '重新下載中'
                  : '修復中'
                : isYtdlp
                  ? '重新下載'
                  : '修復',
              disabled: isBusy,
            },
            {
              id: DEPENDENCY_ADVANCED_ACTIONS.REMOVE,
              icon: Trash2,
              label: isRemoving ? '移除中' : '移除',
              danger: true,
              disabled: isBusy,
            },
          ]
        : []),
    ];
  }

  function dependencyProgressLabel(progress) {
    if (!progress) return '';
    if (progress.stage === 'downloading' && Number.isFinite(progress.percent)) {
      return `下載 ${progress.percent}%`;
    }
    return DEPENDENCY_PROGRESS_LABELS[progress.stage] || '準備中';
  }

  function dependencyWorkflowItem(dependency) {
    const current = featureDependencyState.byId[dependency.id] ?? dependency;
    const progress = featureDependencyState.progressById[dependency.id];
    const isFfmpeg = dependency.id === 'ffmpeg-gyan-essentials';
    const isYtdlp =
      dependency.id === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL;
    const isModel = dependency.kind === 'model';
    const preparing = featureDependencyState.preparingIds.has(dependency.id);
    const installed = Boolean(current.installed);
    const updateAvailable = installed && Boolean(current.updateAvailable);
    const usingSystemFfmpeg = isFfmpeg && current.source === 'system';
    // Only worth flagging while the opt-in hasn't been taken yet — once
    // it's active the row already says so via usingSystemFfmpeg above.
    const systemFfmpegAvailable =
      isFfmpeg &&
      !usingSystemFfmpeg &&
      Boolean(systemFfmpegDetection?.value?.ok);
    const isRemoving = isDependencyActionRunning(
      dependency.id,
      DEPENDENCY_ADVANCED_ACTIONS.REMOVE,
    );
    const isRepairing = isDependencyActionRunning(
      dependency.id,
      DEPENDENCY_ADVANCED_ACTIONS.REPAIR,
    );
    const isBusy = preparing || isRemoving || isRepairing || Boolean(progress);
    const title = isFfmpeg
      ? '音訊轉換工具'
      : isYtdlp
        ? '線上來源下載工具'
        : dependency.name;
    const status = progress
      ? dependencyProgressLabel(progress)
      : updateAvailable
        ? '可更新'
        : installed
          ? isYtdlp
            ? '可使用'
            : usingSystemFfmpeg
              ? '使用系統版本'
              : '已準備'
          : preparing
            ? '準備中'
            : systemFfmpegAvailable
              ? '可用系統版本'
              : current.canMigrate
                ? '待整理'
                : '未準備';
    return {
      ...dependency,
      title,
      description: isFfmpeg
        ? '讓 Utawakui 讀取不同音訊格式，供人聲分離與音訊處理使用。'
        : isYtdlp
          ? '用來把你選定的外部來源保存到本機曲庫。'
          : isModel
            ? '下載後即可在產生人聲分離結果時使用。'
            : '此功能需要先下載的工具或資料。',
      value: dependencyValueLabel(current),
      status,
      statusTone: progress
        ? 'info'
        : updateAvailable
          ? 'warning'
          : installed
            ? 'success'
            : preparing
              ? 'info'
              : systemFfmpegAvailable
                ? 'info'
                : 'warning',
      icon: isFfmpeg ? Wrench : isModel ? Cpu : Download,
      // ffmpeg's primary action always opens FfmpegSourceModal.vue (see
      // SettingsView.vue's handleWorkflowItemAction) rather than downloading
      // directly — the modal is where the system-vs-managed choice happens.
      actionIcon: isFfmpeg
        ? Settings
        : updateAvailable
          ? RefreshCw
          : installed && !isYtdlp
            ? null
            : isYtdlp && installed
              ? null
              : Download,
      actionDisabled: isBusy,
      actionLabel: isFfmpeg
        ? installed
          ? 'FFmpeg 來源設定'
          : `準備${title}`
        : updateAvailable
          ? isYtdlp
            ? '更新下載工具'
            : `更新${title}`
          : installed
            ? isYtdlp
              ? '下載工具已可使用'
              : `${title}已準備`
            : preparing
              ? `準備${title}中`
              : `準備${title}`,
      advancedActions: dependencyAdvancedActions({
        dependency,
        installed,
        preparing,
      }),
    };
  }

  function workflowItemSortRank(item) {
    if (item.statusTone === 'info') return 0;
    if (['未準備', '待整理', '可用系統版本'].includes(item.status)) return 1;
    if (item.statusTone === 'warning' || item.statusTone === 'gated') return 2;
    if (item.statusTone === 'success') return 4;
    return 3;
  }

  function getFeatureWorkflowItems(featureId) {
    return getFeatureDependencies(featureId)
      .map(dependencyWorkflowItem)
      .sort((a, b) => workflowItemSortRank(a) - workflowItemSortRank(b));
  }

  const featureGateRows = computed(() =>
    Object.values(FEATURE_GATES).map((gate) => {
      const enabled = isFeatureEnabled(gate.id);
      const items = getFeatureWorkflowItems(gate.id);
      const isBusy =
        featureGateState.pendingFeatureId === gate.id ||
        enablingFeatureId.value === gate.id;
      return {
        id: gate.id,
        title: FEATURE_GATE_LABELS[gate.id] ?? gate.title,
        // No separate "value" line here — a gate's value would just be a
        // second, slightly longer restatement of `title` (e.g. "音訊處理" /
        // "人聲分離與音訊處理"). description already carries the one sentence
        // that adds real information.
        description: gate.summary,
        status: enabled ? '已啟用' : '未啟用',
        tone: enabled ? 'success' : 'gated',
        icon: enabled ? ListChecks : CircleAlert,
        enabled,
        isBusy,
        items,
        // Same legal/scope disclosure lines shown once in
        // AppFeatureNoticeModal.vue's enable-confirmation dialog — kept
        // reachable afterwards too, since enabling doesn't happen again for
        // an already-enabled gate.
        body: gate.body ?? [],
      };
    }),
  );

  const enabledGateCount = computed(
    () => featureGateRows.value.filter((row) => row.enabled).length,
  );

  async function enableFeature(featureId) {
    if (isFeatureEnabled(featureId) || enablingFeatureId.value) return;
    enablingFeatureId.value = featureId;
    try {
      const enabled = await ensureFeatureGate(featureId);
      if (enabled) clearFeatureGateRequest(featureId);
    } finally {
      enablingFeatureId.value = null;
    }
  }

  function gateActionLabel(gate) {
    if (gate.enabled) return '已啟用';
    if (featureGateState.pendingFeatureId === gate.id) return '等待確認';
    if (enablingFeatureId.value === gate.id || featureGateState.isSaving) {
      return '處理中';
    }
    return '啟用';
  }

  function isGateActionDisabled(gate) {
    return (
      gate.enabled ||
      Boolean(enablingFeatureId.value) ||
      Boolean(featureGateState.pendingFeatureId) ||
      featureGateState.isSaving
    );
  }

  return {
    featureGateRows,
    enabledGateCount,
    enableFeature,
    gateActionLabel,
    isGateActionDisabled,
    DEPENDENCY_ADVANCED_ACTIONS,
  };
}
