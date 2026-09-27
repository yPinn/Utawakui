export const PLAYBACK_HISTORY_QUALIFY_SECONDS = 10;
const MAX_CONTINUOUS_PROGRESS_SECONDS = 5;

export function createPlaybackQualificationTracker({
  onQualified,
  qualifySeconds = PLAYBACK_HISTORY_QUALIFY_SECONDS,
} = {}) {
  let candidateKey = '';
  let candidateTrackId = '';
  let accumulatedSeconds = 0;
  let qualified = false;

  function ensureCandidate(trackId, playbackRevision) {
    if (
      typeof trackId !== 'string' ||
      trackId.length === 0 ||
      !Number.isSafeInteger(playbackRevision) ||
      playbackRevision < 0
    ) {
      return false;
    }
    const nextKey = `${playbackRevision}:${trackId}`;
    if (candidateKey !== nextKey) {
      candidateKey = nextKey;
      candidateTrackId = trackId;
      accumulatedSeconds = 0;
      qualified = false;
    }
    return true;
  }

  function qualify() {
    if (qualified || !candidateTrackId) return false;
    qualified = true;
    onQualified?.(candidateTrackId);
    return true;
  }

  function observeProgress({ trackId, playbackRevision, deltaSeconds } = {}) {
    if (!ensureCandidate(trackId, playbackRevision) || qualified) return false;
    if (
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds <= 0 ||
      deltaSeconds > MAX_CONTINUOUS_PROGRESS_SECONDS
    ) {
      return false;
    }
    accumulatedSeconds += deltaSeconds;
    return accumulatedSeconds >= qualifySeconds ? qualify() : false;
  }

  function observeEnded({ trackId, playbackRevision } = {}) {
    if (!ensureCandidate(trackId, playbackRevision)) return false;
    return qualify();
  }

  function reset() {
    candidateKey = '';
    candidateTrackId = '';
    accumulatedSeconds = 0;
    qualified = false;
  }

  return { observeProgress, observeEnded, reset };
}
