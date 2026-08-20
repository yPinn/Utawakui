import { computed, shallowRef } from 'vue';
import {
  CircleAlert,
  Cpu,
  Download,
  ListChecks,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Video,
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
import { useYtdlpStatus } from './useYtdlpStatus.js';

// Feature-gate/dependency row presentation for SettingsView.vue — pure
// data-shaping (labels, status/tone, workflow-item assembly) that has no
// template ref or lifecycle dependency, split out of the view so the view
// stays interaction/template glue. A per-call factory, not a module-scope
// singleton like useFeatureDependencies.js/useYtdlpStatus.js — those own IPC
// subscriptions that must survive view unmount, this is per-view UI state
// and SettingsView unmounts on every tab switch (see CLAUDE.md's App shell
// section), so a singleton here would be the wrong lifetime.
export function useFeatureGatePresentation({ ytdlpMessage } = {}) {
  const {
    state: featureGateState,
    isFeatureEnabled,
    ensureFeatureGate,
  } = useFeatureGates();
  const { clearFeatureGateRequest } = useFeatureGateAccess();
  const { state: featureDependencyState } = useFeatureDependencies();
  const { state: ytdlpState } = useYtdlpStatus();

  const enablingFeatureId = shallowRef(null);

  const ytdlpCheckResultLabel = computed(() => {
    if (ytdlpState.lastCheckResult === 'up-to-date') return '最新';
    if (ytdlpState.lastCheckResult === 'updated') return '已更新';
    if (ytdlpState.lastCheckResult === 'error') return '失敗';
    return '';
  });

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

  function dependencyLicenseLabel(license) {
    if (license === 'GPL-3.0-or-later bundled executable') return 'GPLv3+';
    if (license === 'GPL-3.0') return 'GPLv3';
    return license || '授權資訊';
  }

  function dependencySourceLabel(dependency) {
    if (dependency.id === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL) {
      return 'yt-dlp';
    }
    if (dependency.id === FEATURE_DEPENDENCY_IDS.FFMPEG_GYAN_ESSENTIALS) {
      return 'Gyan FFmpeg';
    }
    if (dependency.kind === 'model') return 'UVR 模型';
    return dependency.name;
  }

  function dependencyVersionLabel(dependency, isYtdlp) {
    if (isYtdlp && ytdlpState.version) return ytdlpState.version;
    if (dependency.installedVersion) return `v${dependency.installedVersion}`;
    if (dependency.displayVersion) return dependency.displayVersion;
    if (dependency.version === 'managed') return '隨附';
    // Models have no user-facing version — dependency.version is the raw
    // ONNX filename stem (e.g. "UVR_MDXNET_KARA_2"), an internal id, not
    // something to show as a version number. The model's name already
    // identifies it.
    if (dependency.kind === 'model') return '';
    return dependency.version ? `v${dependency.version}` : '';
  }

  function dependencyDisclosureValue(dependency, isYtdlp) {
    return [
      dependencySourceLabel(dependency),
      dependencyLicenseLabel(dependency.license),
      dependencyVersionLabel(dependency, isYtdlp),
    ]
      .filter(Boolean)
      .join(' / ');
  }

  function dependencyAdvancedActions({ dependency, installed, preparing }) {
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
              icon: Wrench,
              label: isRepairing ? '修復中' : '修復',
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
      : installed
        ? isYtdlp
          ? ytdlpCheckResultLabel.value || '可使用'
          : '已準備'
        : preparing
          ? '準備中'
          : current.canMigrate
            ? '待整理'
            : '未準備';
    return {
      ...dependency,
      title,
      description: isFfmpeg
        ? '讓 Utawakui 讀取不同音訊格式，供人聲分離與音訊處理使用。'
        : isYtdlp
          ? ytdlpMessage?.value || '用來把你選定的外部來源保存到本機曲庫。'
          : isModel
            ? '下載後即可在產生人聲分離結果時使用。'
            : '此功能需要先下載的工具或資料。',
      value: dependencyDisclosureValue(current, isYtdlp),
      status,
      statusTone: progress
        ? 'info'
        : isYtdlp &&
            (ytdlpState.lastCheckResult === 'error' || ytdlpState.error)
          ? 'danger'
          : installed
            ? 'success'
            : preparing
              ? 'info'
              : 'warning',
      icon: isFfmpeg ? Wrench : isModel ? Cpu : Download,
      actionIcon:
        installed && !isYtdlp
          ? null
          : isYtdlp && installed
            ? RefreshCw
            : Download,
      actionDisabled: isBusy || (isYtdlp && installed && ytdlpState.isChecking),
      actionLabel: installed
        ? isYtdlp
          ? ytdlpState.isChecking
            ? '檢查下載工具中'
            : '檢查並更新下載工具'
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

  function getPublicOutputWorkflowItems() {
    return [
      {
        id: 'public-output-defaults',
        kind: 'planned-setting',
        icon: Video,
        title: 'OBS 輸出預設',
        description: '設定未來 OBS 畫面來源與場次輸出偏好。',
        value: '尚未提供',
        status: '待開放',
        statusTone: 'gated',
        actionIcon: SlidersHorizontal,
        actionDisabled: true,
        actionLabel: 'OBS 輸出設定稍後提供',
      },
    ];
  }

  function getFeatureWorkflowItems(featureId) {
    const dependencyItems = getFeatureDependencies(featureId).map(
      dependencyWorkflowItem,
    );
    if (featureId === 'public-output-flow') {
      return [...getPublicOutputWorkflowItems(), ...dependencyItems];
    }
    return dependencyItems;
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
        // No separate "value" line here — unlike a real dependency's
        // source/license/version (genuinely new information, and legally
        // required to stay visible), a gate's value would just be a second,
        // slightly longer restatement of `title` (e.g. "音訊處理" / "人聲分離與
        // 音訊處理"). description already carries the one sentence that adds
        // real information.
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
