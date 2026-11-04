import { reactive, readonly, shallowRef } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { useMusicAnalysisCapability } from './useMusicAnalysisCapability.js';
import { useTaskNotification } from '../useTaskNotification.js';
import { useAppView } from '../useAppView.js';
import { t } from '../../utils/i18n.js';

const sessions = new WeakMap();
const owners = new Set();
const unavailableBridge = {};
const capabilityNotice = (operation, outcome) =>
  t(`dependencies.notify.${operation}.${outcome}`, {
    name: t('capabilities.bpm.componentTitle'),
  });

// Settings and Workbench share the same main-owned capability projection. Its
// subscription lives for the renderer lifetime; analysis jobs keep their owners.
export function useMusicAnalysisCapabilitySession({ bridge } = {}) {
  const resolved = bridge ?? globalThis.window?.Utawakui ?? unavailableBridge;
  if (sessions.has(resolved)) return sessions.get(resolved);
  const state = reactive({
    capabilityProgress: null,
    capabilityBusy: false,
    capabilityError: '',
  });
  const capability = shallowRef(null);
  let feedback = null;
  const openSettings = () => useAppView().openSettings('processing');
  const owner = useMusicAnalysisCapability({
    state,
    capability,
    bridge: resolved,
    onActionStart(operation) {
      feedback = useTaskNotification({
        key: NOTIFICATION_KEYS.TASK_MUSIC_ANALYSIS_CAPABILITY,
        title: capabilityNotice(operation, 'running'),
        action: openSettings,
      });
    },
    onProgress() {
      feedback?.progress(owner.stageLabel.value, owner.progressPercent.value);
    },
    onActionComplete(operation) {
      feedback?.finish({ title: capabilityNotice(operation, 'done') });
      feedback = null;
    },
    onActionError(operation, message) {
      feedback?.finish({
        title: capabilityNotice(operation, 'failed'),
        message,
        tone: 'danger',
        actionLabel: t(
          operation === 'remove'
            ? 'player.analysis.viewSettings'
            : 'player.analysis.retry',
        ),
        action:
          operation === 'remove' ? openSettings : () => owner[operation](),
      });
      feedback = null;
    },
  });
  const session = { owner, capability, state: readonly(state) };
  sessions.set(resolved, session);
  owners.add(owner);
  return session;
}

if (import.meta.hot)
  import.meta.hot.dispose(() => owners.forEach((owner) => owner.dispose()));
