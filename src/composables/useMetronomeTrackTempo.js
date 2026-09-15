import { watch } from 'vue';
import { confidentTempo } from '../../shared/presentation/lyricsRhythm.mjs';
import { useMetronome } from './useMetronome.js';
import { useMusicStructureSignals } from './useMusicStructureSignals.js';
import { usePlayer } from './usePlayer.js';

// Wires the metronome's BPM to whatever confident tempo analysis exists for
// the currently loaded track, without making useMetronome.js itself depend
// on the player or music analysis — it must keep working standalone for
// manual accompaniment with no track loaded at all (see ADR 0020).
export function useMetronomeTrackTempo() {
  const { state: playerState } = usePlayer();
  const { current, loadForTrack } = useMusicStructureSignals();
  const { state: metronomeState, applyTrackTempo } = useMetronome();

  function trySync() {
    // The public music-structure document nests tempo/beats/sections under
    // `signals` (see electron/lib/library/musicStructure.js's publicResult()
    // and MusicStructureSummary.vue's identical `result.signals.tempo`
    // access) — not at the document's top level.
    const bpm = confidentTempo(current.value?.signals?.tempo);
    if (bpm === null) return;
    applyTrackTempo(bpm, current.value.signals.tempo.confidence);
  }

  watch(
    () => playerState.track?.id ?? null,
    (trackId) => {
      void loadForTrack(trackId);
    },
    { immediate: true },
  );

  // Also re-checks when the metronome stops: a track change while running
  // is declined by applyTrackTempo(), and would otherwise never get a
  // second chance to apply once the performer stops the click.
  watch([current, () => metronomeState.isRunning], trySync);
}
