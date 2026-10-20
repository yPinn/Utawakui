import { computed, readonly, shallowRef, unref, watch } from 'vue';
import { pickPreferredLyricsSource } from '../utils/lyrics.js';
import {
  deriveLyricsPlaybackState,
  normalizeLyricsDocument,
  projectLegacyLyricLines,
} from '../utils/lyricsDocument.js';
import { DEFAULT_LYRICS_TEXT_VARIANT } from '../utils/lyricsTextVariantValues.js';
import { lyricsTextVariantLoader } from '../utils/lyricsTextVariantLoader.js';
import { createTrackLyricsPreview } from '../utils/trackContextPresentation.js';

function readTrackLyrics(trackId, filename) {
  if (typeof window === 'undefined') return null;
  return window.Utawakui?.getTrackLyrics?.(trackId, filename) ?? null;
}

function sourceIdentity(track, source) {
  if (!track?.id || !source?.filename) return '';
  return [
    track.id,
    source.filename,
    source.sha256 ?? '',
    Number.isInteger(source.offsetMs) ? source.offsetMs : 0,
  ].join('\0');
}

// Playback Info owns a read-only projection of the active track. It loads the
// same canonical lyrics document as the Lyrics workspace without changing that
// workspace's selected track or source.
export function useCurrentTrackLyricsPreview({
  currentTrack,
  playerState,
  liveOffset = null,
  textVariant = DEFAULT_LYRICS_TEXT_VARIANT,
  loadLyrics = readTrackLyrics,
  textVariantLoader = lyricsTextVariantLoader,
}) {
  const loadedTrackId = shallowRef(null);
  const loadedSource = shallowRef(null);
  const lyricsDocument = shallowRef(null);
  const isLoading = shallowRef(false);
  const error = shallowRef(null);
  let requestId = 0;

  const preferredSource = computed(() =>
    pickPreferredLyricsSource(unref(currentTrack)),
  );
  const loadIdentity = computed(() =>
    sourceIdentity(unref(currentTrack), preferredSource.value),
  );

  watch(
    loadIdentity,
    async (_identity, _previousIdentity, onCleanup) => {
      const track = unref(currentTrack);
      const source = preferredSource.value;
      const currentRequestId = ++requestId;
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      loadedTrackId.value = null;
      loadedSource.value = null;
      lyricsDocument.value = null;
      error.value = null;
      isLoading.value = Boolean(track?.id && source?.filename);
      if (!track?.id || !source?.filename) return;

      try {
        const result = await loadLyrics(track.id, source.filename);
        if (cancelled || currentRequestId !== requestId) return;
        const resultSource = result?.source ?? source;
        const timing = result?.timing ?? null;
        const document = normalizeLyricsDocument({
          text: result?.text ?? '',
          source: resultSource,
          sourceFingerprint: timing?.sourceFingerprint ?? null,
          normalizerProfileId: timing?.normalizerProfileId,
          timing,
        });
        const preparation = textVariantLoader.prepare(document);
        if (preparation) await preparation;
        if (cancelled || currentRequestId !== requestId) return;
        loadedTrackId.value = track.id;
        loadedSource.value = resultSource;
        lyricsDocument.value = document;
      } catch (reason) {
        if (cancelled || currentRequestId !== requestId) return;
        error.value = reason;
      } finally {
        if (!cancelled && currentRequestId === requestId) {
          isLoading.value = false;
        }
      }
    },
    { immediate: true },
  );

  const displayDocument = computed(() =>
    textVariantLoader.project(lyricsDocument.value, {
      variant: unref(textVariant) ?? DEFAULT_LYRICS_TEXT_VARIANT,
    }),
  );
  const lyricLines = computed(() =>
    projectLegacyLyricLines(displayDocument.value),
  );
  const playbackPositionMs = computed(() => {
    if (
      !loadedTrackId.value ||
      playerState?.track?.id !== loadedTrackId.value ||
      !Number.isFinite(playerState.currentTime)
    ) {
      return Number.NaN;
    }
    // The lyrics owner can be ahead of disk while a save is pending or failed.
    // Only use its live adjustment for this exact loaded track and source.
    const live = unref(liveOffset);
    const offsetMs =
      live?.trackId === loadedTrackId.value &&
      live?.sourceFilename === loadedSource.value?.filename &&
      Number.isFinite(live?.offsetMs)
        ? live.offsetMs
        : Number.isInteger(loadedSource.value?.offsetMs)
          ? loadedSource.value.offsetMs
          : 0;
    return playerState.currentTime * 1000 + offsetMs;
  });
  const playbackState = computed(() =>
    deriveLyricsPlaybackState(
      displayDocument.value,
      playbackPositionMs.value,
      Number.isFinite(playerState?.duration)
        ? playerState.duration * 1000
        : null,
    ),
  );
  const previewLineIndex = computed(() => {
    if (playbackState.value.activeLineIndex >= 0) {
      return playbackState.value.activeLineIndex;
    }
    const positionMs = playbackPositionMs.value;
    if (!Number.isFinite(positionMs)) return -1;

    return (displayDocument.value?.lines ?? []).findLastIndex(
      (line) => Number.isFinite(line?.startMs) && line.startMs <= positionMs,
    );
  });
  const preview = computed(() =>
    createTrackLyricsPreview({
      currentTrackId: unref(currentTrack)?.id ?? null,
      selectedTrackId: loadedTrackId.value,
      activeLineIndex: previewLineIndex.value,
      lines: lyricLines.value,
      source: loadedSource.value,
    }),
  );

  return {
    preview,
    document: readonly(lyricsDocument),
    loadedTrackId: readonly(loadedTrackId),
    isLoading: readonly(isLoading),
    error: readonly(error),
  };
}
