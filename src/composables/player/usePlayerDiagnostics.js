// Bounded runtime evidence only; audio events remain the playback authority.
export function usePlayerDiagnostics(state) {
  const lastAudioDiagnosticAt = new Map();

  function recordAudioDiagnostic(operation, reason, context = {}) {
    const key = `${operation}:${reason}`;
    const now = Date.now();
    const previous = lastAudioDiagnosticAt.get(key);
    if (previous !== undefined && now - previous < 30_000) return;
    lastAudioDiagnosticAt.set(key, now);
    try {
      Promise.resolve(
        globalThis.window?.Utawakui?.recordDiagnostic?.({
          level: operation === 'processor-error' ? 'error' : 'warning',
          source: 'player',
          operation,
          code: `PLAYER_AUDIO_${operation.replaceAll('-', '_').toUpperCase()}`,
          message: 'Playback audio runtime state changed',
          context: {
            reason,
            stage: state.track?.usesSeparatedAudio ? 'separated' : 'original',
            ...context,
          },
        }),
      ).catch(() => {});
    } catch {
      // A diagnostic cannot interrupt the audio event owner.
    }
  }
  return recordAudioDiagnostic;
}
