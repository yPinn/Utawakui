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
import { catalogKey, t } from '../utils/i18n.js';

// Feature-gate/dependency row presentation for SettingsCapabilitiesSection.vue: pure
// data-shaping (labels, status/tone, workflow items) with no template ref or
// lifecycle dependency, so the section stays interaction/template glue. A per-call
// factory, not a singleton like useFeatureDependencies.js: those own IPC
// subscriptions that must outlive the section, while this is per-section state.
// systemFfmpegDetection is a caller-supplied ref with the last
// window.Utawakui.detectSystemFfmpeg() result; it only feeds the compact row's
// "可用系統版本" hint. Detection detail lives in FfmpegSourceModal.vue.
export function useFeatureGatePresentation({ systemFfmpegDetection } = {}) {
  const {
    state: featureGateState,
    isFeatureEnabled,
    ensureFeatureGate,
  } = useFeatureGates();
  const { clearFeatureGateRequest } = useFeatureGateAccess();
  const { state: featureDependencyState } = useFeatureDependencies();

  const enablingFeatureId = shallowRef(null);

  // Settings summary copy per gate; notice bodies stay in shared/featureGates.json.
  const gateCopy = (gateId, field) =>
    t(`featureGates.gates.${catalogKey(gateId)}.${field}`);

  const DEPENDENCY_ADVANCED_ACTIONS = Object.freeze({
    REFRESH: 'refresh',
    REPAIR: 'repair',
    REMOVE: 'remove',
  });

  const DEPENDENCY_PROGRESS_LABELS = Object.freeze({
    starting: t('dependencies.progress.starting'),
    downloading: t('dependencies.progress.downloading'),
    verifying: t('dependencies.progress.verifying'),
    installing: t('dependencies.progress.installing'),
    ready: t('dependencies.progress.ready'),
  });

  function isDependencyActionRunning(dependencyId, action) {
    return featureDependencyState.actionIds.has(`${action}:${dependencyId}`);
  }

  function dependencyValueLabel(dependency) {
    if (
      dependency.id === FEATURE_DEPENDENCY_IDS.FFMPEG_GYAN_ESSENTIALS &&
      dependency.source === 'system'
    ) {
      return t('dependencies.value.systemFfmpeg');
    }
    if (dependency.id === FEATURE_DEPENDENCY_IDS.YTDLP_PROVIDER_TOOL) {
      return t('dependencies.value.ytdlp');
    }
    if (dependency.id === FEATURE_DEPENDENCY_IDS.FFMPEG_GYAN_ESSENTIALS) {
      return t('dependencies.value.ffmpeg');
    }
    if (dependency.kind === 'model') return t('dependencies.value.model');
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
        label: t('dependencies.actions.refresh'),
        disabled: featureDependencyState.isLoading || isBusy,
      },
      ...(installed
        ? [
            {
              id: DEPENDENCY_ADVANCED_ACTIONS.REPAIR,
              icon: isYtdlp ? Download : Wrench,
              label: isRepairing
                ? isYtdlp
                  ? t('dependencies.actions.redownloading')
                  : t('dependencies.actions.repairing')
                : isYtdlp
                  ? t('dependencies.actions.redownload')
                  : t('dependencies.actions.repair'),
              disabled: isBusy,
            },
            {
              id: DEPENDENCY_ADVANCED_ACTIONS.REMOVE,
              icon: Trash2,
              label: isRemoving
                ? t('dependencies.actions.removing')
                : t('dependencies.actions.remove'),
              intent: 'danger',
              disabled: isBusy,
            },
          ]
        : []),
    ];
  }

  function dependencyProgressLabel(progress) {
    if (!progress) return '';
    if (progress.stage === 'downloading' && Number.isFinite(progress.percent)) {
      return t('dependencies.progress.downloadPercent', {
        percent: progress.percent,
      });
    }
    return (
      DEPENDENCY_PROGRESS_LABELS[progress.stage] ||
      t('dependencies.progress.starting')
    );
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
      ? t('dependencies.title.ffmpeg')
      : isYtdlp
        ? t('dependencies.title.ytdlp')
        : dependency.name;
    // Codes drive ordering; labels are derived from them.
    const statusCode = progress
      ? 'progress'
      : updateAvailable
        ? 'updateAvailable'
        : installed
          ? isYtdlp
            ? 'available'
            : usingSystemFfmpeg
              ? 'usingSystem'
              : 'prepared'
          : preparing
            ? 'preparing'
            : systemFfmpegAvailable
              ? 'systemAvailable'
              : current.canMigrate
                ? 'needsMigration'
                : 'missing';
    const status =
      statusCode === 'progress'
        ? dependencyProgressLabel(progress)
        : t(`dependencies.status.${statusCode}`);
    return {
      ...dependency,
      notice: featureDependencyState.errorsById?.[dependency.id] ?? null,
      busy: isBusy,
      needsAttention:
        Boolean(
          featureDependencyState.readError ||
          featureDependencyState.errorsById?.[dependency.id],
        ) ||
        (!isBusy &&
          (updateAvailable || (!installed && !systemFfmpegAvailable))),
      title,
      description: isFfmpeg
        ? t('dependencies.description.ffmpeg')
        : isYtdlp
          ? t('dependencies.description.ytdlp')
          : isModel
            ? t('dependencies.description.model')
            : t('dependencies.description.other'),
      value: dependencyValueLabel(current),
      status: featureDependencyState.readError
        ? t('dependencies.status.unreadable')
        : status,
      statusCode,
      statusTone: featureDependencyState.readError
        ? 'warning'
        : progress
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
      // SettingsCapabilitiesSection.vue's handleWorkflowItemAction) rather than downloading
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
      actionDisabled: isBusy || Boolean(featureDependencyState.readError),
      actionLabel: isFfmpeg
        ? installed
          ? t('dependencies.actions.ffmpegSource')
          : t('dependencies.actions.prepareNamed', { name: title })
        : updateAvailable
          ? isYtdlp
            ? t('dependencies.actions.updateYtdlp')
            : t('dependencies.actions.updateNamed', { name: title })
          : installed
            ? isYtdlp
              ? t('dependencies.actions.ytdlpReady')
              : t('dependencies.actions.preparedNamed', { name: title })
            : preparing
              ? t('dependencies.actions.preparingNamed', { name: title })
              : t('dependencies.actions.prepareNamed', { name: title }),
      advancedActions: dependencyAdvancedActions({
        dependency,
        installed,
        preparing,
      }),
    };
  }

  function workflowItemSortRank(item) {
    if (item.statusTone === 'info') return 0;
    if (
      ['missing', 'needsMigration', 'systemAvailable'].includes(item.statusCode)
    )
      return 1;
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
        title: gateCopy(gate.id, 'title'),
        // No separate "value" line here — a gate's value would just be a
        // second, slightly longer restatement of `title` (e.g. "音訊處理" /
        // "人聲分離與音訊處理"). description already carries the one sentence
        // that adds real information.
        description: gateCopy(gate.id, 'description'),
        status: featureGateState.readError
          ? t('featureGates.status.unreadable')
          : enabled
            ? t('featureGates.status.enabled')
            : t('featureGates.status.disabled'),
        tone: featureGateState.readError
          ? 'warning'
          : enabled
            ? 'success'
            : 'gated',
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
    if (gate.enabled) return t('featureGates.status.enabled');
    if (featureGateState.pendingFeatureId === gate.id)
      return t('featureGates.action.pending');
    if (enablingFeatureId.value === gate.id || featureGateState.isSaving) {
      return t('featureGates.action.busy');
    }
    return t('featureGates.action.enable');
  }

  function isGateActionDisabled(gate) {
    return (
      Boolean(featureGateState.readError) ||
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
