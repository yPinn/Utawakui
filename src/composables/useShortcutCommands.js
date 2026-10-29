import { usePlayer } from './usePlayer.js';
import { usePlaybackTransport } from './usePlaybackTransport.js';
import { useLyrics } from './useLyrics.js';
import { SHORTCUT_COMMANDS } from '../../shared/keyboardShortcutContract.mjs';
import { validPerformanceSettings } from '../../shared/performanceSettings.mjs';

const COMMANDS = new Set(SHORTCUT_COMMANDS.map(({ id }) => id));
const isVolume = (command) =>
  command === 'player.volume-up' || command === 'player.volume-down';
const volumeTarget = (command, value) =>
  Math.round(
    Math.min(1, Math.max(0, value + (command.endsWith('up') ? 0.1 : -0.1))) *
      100,
  ) / 100;
const result = (status) => Object.freeze({ ok: status === 'executed', status });
const domain = (command) =>
  command.startsWith('lyrics.')
    ? 'offset'
    : command.includes('transpose')
      ? 'transpose'
      : 'transport';

// Commands coordinate existing owners. They do not own a queue, audio clock,
// requested/applied DSP state, source session, save queue, or retry mechanism.
export function useShortcutCommandExecutor({ player, transport, lyrics }) {
  let generation = 0,
    disposed = false;
  const pending = new Map();
  const state = player.state;
  const pausing = () => state.isPlaying || Boolean(state.pendingStartTrackId);
  function availability(command) {
    if (!COMMANDS.has(command)) return 'unknown';
    if (disposed) return 'blocked';
    // Main-player preferences remain usable without a loaded song or while a
    // transport/profile transaction is busy. These existing owners are sync.
    if (command === 'player.mute')
      return typeof state.isMuted === 'boolean' ? null : 'unavailable';
    if (isVolume(command))
      return Number.isFinite(state.volume) &&
        state.volume >= 0 &&
        state.volume <= 1 &&
        volumeTarget(command, state.volume) !== state.volume
        ? null
        : 'unavailable';
    // Pause remains an immediate cancellation, including a pending command Play.
    if (command === 'player.play-pause' && pausing()) {
      return transport.arrangementBusy.value && !state.isPlaying
        ? 'busy'
        : null;
    }
    if (
      pending.has(domain(command)) ||
      transport.arrangementBusy.value ||
      state.pendingStartTrackId
    )
      return 'busy';
    if (command === 'player.next')
      return transport.canPlayNext.value ? null : 'unavailable';
    if (!state.track) return 'unavailable';
    if (command === 'player.play-pause' || command === 'player.previous')
      return null;
    if (player.performanceSettings.busy.value) return 'busy';
    if (domain(command) === 'transpose') {
      const applied = state.audioControlApplication;
      if (applied?.status === 'pending') return 'busy';
      const values = applied?.applied;
      if (
        !applied?.ok ||
        applied.status !== 'applied' ||
        !validPerformanceSettings(values) ||
        applied.lanes?.monitor !== 'applied' ||
        !['applied', 'disabled'].includes(applied.lanes?.capture) ||
        values.transposeSemitones !== state.transposeSemitones ||
        values.pitchCents !== state.pitchCents ||
        values.tempoRate !== state.tempoRate ||
        values.monitorGuideVocalEnabled !== state.guideVocalOn
      )
        return 'unavailable';
      const next =
        values.transposeSemitones + (command.endsWith('up') ? 1 : -1);
      return next < -12 || next > 12 ? 'unavailable' : null;
    }
    const source = lyrics.state;
    if (
      source.isLoadingLyrics ||
      source.timingSave.isSaving ||
      source.offsetSave.isSaving ||
      source.sourceAction?.isSaving ||
      lyrics.timingReview.state.isBusy
    )
      return 'busy';
    if (
      source.selectedTrackId !== state.track.id ||
      !source.selectedSourceFilename ||
      !lyrics.sourceSession.value?.id ||
      source.offsetSave.error ||
      !Number.isFinite(source.offsetSeconds) ||
      Math.abs(source.offsetSeconds + (command.endsWith('up') ? 0.1 : -0.1)) >
        3600
    )
      return 'unavailable';
    return null;
  }
  const playerStamp = () => ({
    id: state.track?.id,
    url: state.track?.url,
    revision: state.playbackRevision,
    start: player.getPlaybackStartRequestRevision(),
  });
  const samePlayer = (stamp) =>
    stamp.id === state.track?.id &&
    stamp.url === state.track?.url &&
    stamp.revision === state.playbackRevision &&
    stamp.start === player.getPlaybackStartRequestRevision();

  async function execute(
    command,
    { isCurrent = () => true, scope = 'app' } = {},
  ) {
    const unavailable = availability(command);
    if (unavailable) return result(unavailable);
    if (!isCurrent()) return result('stale');
    if (command === 'player.mute' || isVolume(command)) {
      try {
        if (command === 'player.mute') player.toggleMute();
        else player.setVolume(volumeTarget(command, state.volume));
        return result('executed');
      } catch {
        return result('failed');
      }
    }
    if (command === 'player.play-pause' && pausing()) {
      try {
        player.pause();
        return result('executed');
      } catch {
        return result('failed');
      }
    }
    const key = domain(command),
      operation = { generation, start: null, scope, revoked: false };
    pending.set(key, operation);
    const current = () =>
      !disposed &&
      !operation.revoked &&
      operation.generation === generation &&
      isCurrent();
    const stamp = playerStamp();
    try {
      if (key === 'transpose') {
        const next =
          state.audioControlApplication.applied.transposeSemitones +
          (command.endsWith('up') ? 1 : -1);
        const applied = await player.setTransposeSemitones(next, {
          isCurrent: () => current() && samePlayer(stamp),
        });
        if (!current() || !samePlayer(stamp)) return result('stale');
        return result(
          applied?.ok && applied.status === 'applied' ? 'executed' : 'failed',
        );
      }
      if (key === 'offset') {
        const source = lyrics.state,
          session = lyrics.sourceSession.value;
        const sourceStamp = {
          track: source.selectedTrackId,
          filename: source.selectedSourceFilename,
          session: session.id,
          timing: session.timingRevision,
          offset: session.offsetRevision,
        };
        const delta = command.endsWith('up') ? 0.1 : -0.1;
        const targetMs = Math.round((source.offsetSeconds + delta) * 10) * 100;
        const saved = await lyrics.adjustOffset(delta, {
          isCurrent: () =>
            current() &&
            samePlayer(stamp) &&
            !transport.arrangementBusy.value &&
            !player.performanceSettings.busy.value &&
            !source.isLoadingLyrics &&
            !source.timingSave.isSaving &&
            !source.sourceAction?.isSaving &&
            !lyrics.timingReview.state.isBusy &&
            source.selectedTrackId === sourceStamp.track &&
            source.selectedSourceFilename === sourceStamp.filename &&
            lyrics.sourceSession.value?.id === sourceStamp.session &&
            lyrics.sourceSession.value.timingRevision === sourceStamp.timing &&
            lyrics.sourceSession.value.offsetRevision === sourceStamp.offset,
        });
        if (
          !current() ||
          !samePlayer(stamp) ||
          source.selectedTrackId !== sourceStamp.track ||
          source.selectedSourceFilename !== sourceStamp.filename ||
          lyrics.sourceSession.value?.id !== sourceStamp.session ||
          lyrics.sourceSession.value.timingRevision !== sourceStamp.timing
        )
          return result('stale');
        if (!saved) return result('failed');
        if (
          source.offsetSave.isSaving ||
          Math.round(source.offsetSeconds * 1000) !== targetMs
        )
          return result('stale');
        return result(
          saved?.source?.offsetMs === targetMs &&
            saved?.sourceSession?.id === sourceStamp.session &&
            saved.sourceSession.offsetRevision ===
              lyrics.sourceSession.value.offsetRevision &&
            !source.offsetSave.error
            ? 'executed'
            : 'failed',
        );
      }
      let task;
      if (command === 'player.play-pause') task = player.play();
      else {
        player.practiceBoundary.intent('replace');
        task =
          command === 'player.next'
            ? transport.playNext()
            : transport.playPrevious();
      }
      // Cancel only the start this command synchronously handed to the owner;
      // never cancel another caller's later request or roll back committed work.
      const started = player.getPlaybackStartRequestRevision();
      if (started !== stamp.start) operation.start = started;
      const completed = await task;
      if (
        !current() ||
        (command === 'player.play-pause' &&
          started !== player.getPlaybackStartRequestRevision())
      )
        return result('stale');
      return result(completed === true ? 'executed' : 'failed');
    } catch {
      return result(current() ? 'failed' : 'stale');
    } finally {
      if (pending.get(key) === operation) pending.delete(key);
    }
  }
  function invalidate(scope) {
    if (scope === undefined) generation++;
    for (const [key, operation] of pending) {
      if (scope !== undefined && operation.scope !== scope) continue;
      operation.revoked = true;
      if (
        operation.start !== null &&
        state.pendingStartTrackId &&
        operation.start === player.getPlaybackStartRequestRevision()
      )
        player.cancelPendingStart();
      pending.delete(key);
    }
  }
  return {
    canExecute: (command) => availability(command) === null,
    execute,
    invalidate,
    contextIdentity: () =>
      JSON.stringify([
        state.track?.id,
        state.track?.url,
        state.playbackRevision,
        state.pendingStartTrackId,
        state.isPlaying,
        player.getPlaybackStartRequestRevision(),
        lyrics.state.selectedTrackId,
        lyrics.state.selectedSourceFilename,
        lyrics.sourceSession.value?.id,
        lyrics.sourceSession.value?.timingRevision,
        lyrics.sourceSession.value?.offsetRevision,
      ]),
    dispose() {
      invalidate();
      disposed = true;
    },
  };
}

export function useShortcutCommands() {
  return useShortcutCommandExecutor({
    player: usePlayer(),
    transport: usePlaybackTransport(),
    lyrics: useLyrics(),
  });
}
