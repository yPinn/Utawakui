import { usePerformerSelfView } from './usePerformerSelfView.js';
import { useShortcutCommands } from './useShortcutCommands.js';
import { useAppRightDock } from './useAppRightDock.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { useLibrary } from './useLibrary.js';

const READING_ACTIONS = Object.freeze({
  'reading.off': 'reading-off',
  'reading.furigana': 'reading-furigana',
  'reading.romaji': 'reading-romaji',
});
const EXECUTOR_STATUSES = new Map([
  ['executed', 'applied'],
  ['stale', 'stale'],
  ['busy', 'busy'],
  ['unavailable', 'unavailable'],
]);

let unsubscribe = null;

// Applies phone commands Main already admitted. Each must match a snapshot
// this window published for the current track, then runs through the same
// executor as keyboard shortcuts.
export function useCompanionRemote({
  bridge = globalThis.window?.Utawakui,
  selfView = usePerformerSelfView(),
  executor = useShortcutCommands(),
} = {}) {
  async function applyQueue({
    command,
    revision,
    trackId,
    queueIndex,
    libraryTrackId,
  }) {
    const published = selfView.publishedQueueContext(revision, trackId);
    if (!published) return 'stale';
    const queue = usePlaybackQueue();
    if (command === 'queue.view-queue' || command === 'queue.view-recent') {
      const dock = useAppRightDock();
      dock.selectQueueVariant('queue');
      dock.selectQueueTab(command === 'queue.view-queue' ? 'queue' : 'recent');
      return 'applied';
    }
    if (
      command === 'queue.view-arrangement-pending' ||
      command === 'queue.view-arrangement-history'
    ) {
      const dock = useAppRightDock();
      dock.selectQueueVariant('arrangement');
      dock.selectArrangementTab(
        command === 'queue.view-arrangement-history' ? 'history' : 'pending',
      );
      return 'applied';
    }
    if (command === 'queue.clear') {
      const current = queue.queuedTracks.value;
      if (
        current.length !== published.manualIds.length ||
        current.some(({ id }, index) => id !== published.manualIds[index])
      )
        return 'stale';
      queue.clearQueuedTracks();
      return 'applied';
    }
    if (command === 'library.play' || command === 'library.enqueue') {
      const track = useLibrary().tracksById.value.get(libraryTrackId);
      if (!track) return 'unavailable';
      if (command === 'library.enqueue')
        return queue.enqueueTrack(track) ? 'applied' : 'unavailable';
      return playSelection({ track, interrupt: true });
    }
    if (command === 'queue.play-recent') {
      const track = selfView.resolvePublishedRecentSelection(
        revision,
        trackId,
        queueIndex,
      );
      return track ? playSelection({ track, interrupt: true }) : 'stale';
    }
    const selected = selfView.resolvePublishedQueueSelection(
      revision,
      trackId,
      queueIndex,
    );
    if (!selected) return 'stale';
    if (command === 'queue.remove')
      return !selected.source && queue.removeQueuedTrack(selected.track.id)
        ? 'applied'
        : 'unavailable';
    if (command !== 'queue.move-up' && command !== 'queue.move-down')
      return 'unavailable';
    const up = command === 'queue.move-up';
    const neighbor = selfView.resolvePublishedQueueSelection(
      revision,
      trackId,
      queueIndex + (up ? -1 : 1),
    );
    if (!neighbor || neighbor.source !== selected.source) return 'stale';
    const move = selected.source
      ? queue.reorderSourceTrack
      : queue.reorderQueuedTrack;
    return move(selected.track.id, neighbor.track.id, up ? 'before' : 'after')
      ? 'applied'
      : 'stale';
  }

  async function playSelection(queueSelection) {
    const result = await executor.execute('queue.play', {
      scope: 'companion',
      queueSelection,
    });
    return EXECUTOR_STATUSES.get(result.status) ?? 'failed';
  }

  async function apply(message) {
    const { command, revision, trackId, positionMs, queueIndex } = message;
    if (command === 'output.set-option')
      return selfView.applyOutputOption(message);
    if (command === 'queue.play') {
      const queueSelection = selfView.resolvePublishedQueueSelection(
        revision,
        trackId,
        queueIndex,
      );
      if (!queueSelection) return 'stale';
      return playSelection(queueSelection);
    }
    if (command.startsWith('queue.') || command.startsWith('library.'))
      return applyQueue(message);
    const action = READING_ACTIONS[command];
    if (action)
      return (await selfView.applyControlIntent({ action, revision, trackId }))
        ? 'applied'
        : 'stale';
    const isCurrent = () => selfView.matchesPublishedContext(revision, trackId);
    if (!isCurrent()) return 'stale';
    const result = await executor.execute(command, {
      isCurrent,
      scope: 'companion',
      ...(command === 'player.seek' ? { positionMs } : {}),
    });
    return EXECUTOR_STATUSES.get(result.status) ?? 'failed';
  }

  async function handle(message) {
    let status;
    try {
      status = await apply(message);
    } catch {
      status = 'failed';
    }
    try {
      await bridge?.reportCompanionCommandResult?.(message.id, status);
    } catch {
      // Main times the command out if the report is lost.
    }
    return status;
  }

  function initialize() {
    unsubscribe ??= bridge?.onCompanionCommand?.(handle) ?? null;
  }

  function dispose() {
    unsubscribe?.();
    unsubscribe = null;
  }

  return { initialize, dispose, handle, apply };
}
