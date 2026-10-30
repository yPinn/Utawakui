import { watch } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { useAppNotifications } from '../useAppNotifications.js';
import { t } from '../../utils/i18n.js';

const NOTICE_KEY = NOTIFICATION_KEYS.PLAYER_PLAYBACK;

// Projects the player's current error into the shared notification owner,
// instead of a second fixed layer beside it. Sync flush sees a retry clear the
// error and fail again with the same message, so the notice returns.
export function usePlayerErrorNotice({
  state,
  retry,
  retryMonitorOutput = null,
  notifications = useAppNotifications(),
}) {
  watch(
    () => [state.error, state.monitorOutputError],
    ([playbackError, monitorError]) => {
      const isMonitorError = !playbackError && Boolean(monitorError);
      const message = playbackError || monitorError?.message;
      if (!message) {
        notifications.clear(NOTICE_KEY);
        return;
      }
      notifications.notify({
        key: NOTICE_KEY,
        title: isMonitorError
          ? t('playerAudio.monitorOutputTitle')
          : '播放未完成',
        message,
        tone: 'danger',
        lifecycle: 'persistent',
        actionLabel: isMonitorError
          ? t('playerAudio.retryMonitorOutput')
          : '重試',
        action: isMonitorError ? retryMonitorOutput : retry,
      });
    },
    { flush: 'sync' },
  );
}
