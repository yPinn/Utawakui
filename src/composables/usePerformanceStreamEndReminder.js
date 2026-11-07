import { onMounted, onUnmounted, readonly, shallowRef, watch } from 'vue';
import { NOTIFICATION_KEYS } from '../constants/notificationKeys.js';
import { t } from '../utils/i18n.js';
import { useAppNotifications } from './useAppNotifications.js';
import { useAppView } from './useAppView.js';
import { usePerformanceSessionPlan } from './usePerformanceSessionPlan.js';

const finishRequest = shallowRef(null);
export const streamEndFinishRequest = readonly(finishRequest);

export function consumeStreamEndFinishRequest(sessionId) {
  if (finishRequest.value === sessionId) finishRequest.value = null;
}

export function usePerformanceStreamEndReminder() {
  const plan = usePerformanceSessionPlan();
  const { openPerformancePreparation } = useAppView();
  const { notify, clear } = useAppNotifications();
  const key = NOTIFICATION_KEYS.PERFORMANCE_STREAM_ENDED;
  let unsubscribe;
  let reminderSessionId = null;
  let revision = 0;

  const isCurrent = (sessionId) =>
    plan.state.plan.sessionId === sessionId && plan.state.plan.canArchive;

  async function remind(sessionId) {
    const request = ++revision;
    if (!isCurrent(sessionId) && !(await plan.refresh())) return;
    if (request !== revision || !isCurrent(sessionId)) return;
    reminderSessionId = sessionId;
    notify({
      key,
      variant: 'confirmation',
      tone: 'info',
      title: t('session.history.streamEndedTitle'),
      message: t('session.history.streamEndedMessage'),
      dismissLabel: t('session.history.finishLater'),
      actionLabel: t('session.history.finishAndArchive'),
      actionVariant: 'accent',
      action: () => {
        if (!isCurrent(sessionId)) return;
        finishRequest.value = sessionId;
        openPerformancePreparation('history');
      },
    });
  }

  watch(
    () => [plan.state.plan.sessionId, plan.state.plan.canArchive],
    () => {
      if (reminderSessionId && !isCurrent(reminderSessionId)) {
        reminderSessionId = null;
        clear(key);
      }
      if (finishRequest.value && !isCurrent(finishRequest.value)) {
        finishRequest.value = null;
      }
    },
  );

  onMounted(() => {
    unsubscribe = window.Utawakui?.onObsStreamEnded?.(remind);
  });
  onUnmounted(() => {
    ++revision;
    unsubscribe?.();
    finishRequest.value = null;
    clear(key);
  });
}
