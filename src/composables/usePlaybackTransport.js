import { usePlayer } from './usePlayer.js';
import { usePlaybackQueue } from './usePlaybackQueue.js';
import { toPlayableTrack } from '../utils/playableTrack.js';
import { computed, shallowRef } from 'vue';

const arrangement = shallowRef(null);
export function registerPlaybackArrangement(controller) {
  arrangement.value = controller;
  return () => {
    if (arrangement.value === controller) arrangement.value = null;
  };
}

// Previous／next transport actions over the queue, shared by PlayerBar and the
// system media session so a hardware key does exactly what the on-screen button does.
export function usePlaybackTransport() {
  const { playTrack, restartTrack, state: playerState } = usePlayer();
  const { previousTrack, nextTrack, restartSourceQueue, canGoNext } =
    usePlaybackQueue();
  const arrangementActive = computed(
    () => arrangement.value?.ownsPlayback.value === true,
  );
  const arrangementBusy = computed(
    () => arrangement.value?.state?.busy === true,
  );
  const canPlayNext = computed(() =>
    arrangementActive.value
      ? arrangement.value.canNext.value
      : canGoNext?.value === true,
  );

  function playQueuedTrack(track) {
    if (!track) return;
    return playTrack(toPlayableTrack(track));
  }

  function playPrevious() {
    if (arrangementActive.value) return arrangement.value.previous();
    const previous = previousTrack();
    if (previous) {
      return playQueuedTrack(previous);
    }

    return restartTrack();
  }

  function playNext() {
    if (arrangementActive.value) return arrangement.value.next();
    return playQueuedTrack(nextTrack());
  }

  function playAfterEnded(event) {
    if (
      event &&
      playerState?.track &&
      (event.trackId !== playerState.track.id ||
        event.playbackRevision !== playerState.playbackRevision)
    )
      return;
    if (arrangement.value?.handleEnded(event)) return;
    // A duplicate ended from an owned occurrence must never advance the
    // ordinary queue while its first callback is saving progress.
    if (arrangementActive.value) return;
    const next =
      nextTrack() ||
      (playerState?.playbackMode === 'repeat-list'
        ? restartSourceQueue()
        : null);
    playQueuedTrack(next);
  }

  return {
    playQueuedTrack,
    playPrevious,
    playNext,
    playAfterEnded,
    canPlayNext,
    arrangementActive,
    arrangementBusy,
  };
}
