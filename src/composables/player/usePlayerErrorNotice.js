import { watch } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { useAppNotifications } from '../useAppNotifications.js';

const NOTICE_KEY = NOTIFICATION_KEYS.PLAYER_PLAYBACK;

// Projects the player's current error into the shared notification owner,
// instead of a second fixed layer beside it. Sync flush sees a retry clear the
// error and fail again with the same message, so the notice returns.
export function usePlayerErrorNotice({
  state,
  retry,
  notifications = useAppNotifications(),
}) {
  watch(
    () => state.error,
    (message) => {
      if (!message) {
        notifications.clear(NOTICE_KEY);
        return;
      }
      notifications.notify({
        key: NOTICE_KEY,
        title: '播放未完成',
        message,
        tone: 'danger',
        lifecycle: 'persistent',
        actionLabel: '重試',
        action: retry,
      });
    },
    { flush: 'sync' },
  );
}
