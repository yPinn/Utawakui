import { usePerformerSelfView } from './usePerformerSelfView.js';
import { useShortcutCommands } from './useShortcutCommands.js';

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
  async function apply({ command, revision, trackId }) {
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

  return { initialize, dispose, handle };
}
