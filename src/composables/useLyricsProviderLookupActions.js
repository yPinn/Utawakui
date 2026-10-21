import { useAppNotifications } from './useAppNotifications.js';

const ACTIONS = new Map([
  ['copy-candidate-id', ['候選 ID 已複製', '無法複製候選 ID']],
  ['copy-recording-mbid', ['Recording MBID 已複製', '無法複製 Recording MBID']],
  ['copy-artist-title', ['歌手＋歌名已複製', '無法複製歌手＋歌名']],
  [
    'open-musicbrainz-recording',
    ['已開啟 MusicBrainz', '無法開啟 MusicBrainz'],
  ],
]);
const attempts = new WeakMap();

export function useLyricsProviderLookupActions({
  bridge = globalThis.window?.Utawakui,
} = {}) {
  const target = bridge ?? {};
  if (!attempts.has(target)) attempts.set(target, new Map());
  const latest = attempts.get(target);
  const notifications = useAppNotifications();

  async function run(candidateId, action) {
    const labels = ACTIONS.get(action);
    if (
      !labels ||
      typeof candidateId !== 'string' ||
      !candidateId.trim() ||
      candidateId.length > 256
    )
      return false;
    const key = `lyrics-provider-lookup:${action}`;
    const attempt = {};
    latest.set(action, attempt);
    notifications.clear(key);
    try {
      // Main resolves all copied text and external URLs from this fixed intent.
      const result = await target.runLyricsProviderReviewLookupAction({
        candidateId,
        action,
      });
      if (result?.completed !== true)
        throw new Error('lookup action not completed');
      if (latest.get(action) !== attempt) return false;
      notifications.notify({ key, title: labels[0] });
      return true;
    } catch {
      if (latest.get(action) !== attempt) return false;
      notifications.notify({
        key,
        title: labels[1],
        message:
          action === 'open-musicbrainz-recording'
            ? '請重試，或使用 Recording MBID 查詢。'
            : '請重試，或手動選取表單中的文字。',
        tone: 'danger',
        actionLabel: '重試',
        action: () => run(candidateId, action),
      });
      return false;
    }
  }

  return { run };
}
