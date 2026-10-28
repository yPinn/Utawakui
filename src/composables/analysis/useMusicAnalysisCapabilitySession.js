import { reactive, readonly, shallowRef } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { useMusicAnalysisCapability } from './useMusicAnalysisCapability.js';
import { useTaskNotification } from '../useTaskNotification.js';
import { useAppView } from '../useAppView.js';

const sessions = new WeakMap();
const owners = new Set();
const unavailableBridge = {};
const OPERATIONS = { prepare: '準備', repair: '修復', remove: '移除' };

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
        title: `BPM 分析元件${OPERATIONS[operation]}中`,
        action: openSettings,
      });
    },
    onProgress() {
      feedback?.progress(owner.stageLabel.value, owner.progressPercent.value);
    },
    onActionComplete(operation) {
      feedback?.finish({ title: `BPM 分析元件已${OPERATIONS[operation]}` });
      feedback = null;
    },
    onActionError(operation, message) {
      feedback?.finish({
        title: `BPM 分析元件${OPERATIONS[operation]}未完成`,
        message,
        tone: 'danger',
        actionLabel: operation === 'remove' ? '查看設定' : '重試',
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
