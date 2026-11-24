import { computed, readonly, shallowRef, toValue, watch } from 'vue';
import { useLyricsVocalRoles } from './useLyricsVocalRoles.js';
import {
  LYRICS_REPEAT_MODES,
  adjoiningEqualLyricLines,
  lyricsLineVocalRoles,
  lyricsRepeatRuns,
  preprocessLyricsDocument,
  projectLyricsTextSelection,
} from '../../../shared/presentation/lyricsTextProcessing.mjs';

const REPEAT_STORAGE_PREFIX = 'utawakui.output.lyric-repeats.';

export function useLyricsTextProcessing({
  document,
  sourceKey,
  performers,
  trackId,
  reportError,
}) {
  const vocalRoles = useLyricsVocalRoles({ document, trackId, reportError });
  const overrides = shallowRef(new Map());
  const repeatModes = shallowRef(new Map());
  const repeatDrafts = new Map();
  const repeatStorageKey = computed(() => {
    const id = toValue(document)?.documentId;
    return id
      ? REPEAT_STORAGE_PREFIX + JSON.stringify([toValue(sourceKey), id])
      : null;
  });
  const options = () => ({
    performers: toValue(performers) ?? [],
    assignments: vocalRoles.assignments.value,
  });
  const analysis = computed(() =>
    preprocessLyricsDocument(toValue(document), options()),
  );
  const hiddenLineIds = computed(() =>
    analysis.value.outputCandidates
      .filter((line) => overrides.value.get(line.lineId) ?? line.defaultHidden)
      .map((line) => line.lineId),
  );
  const repeatCandidates = computed(() =>
    (toValue(document)?.lines ?? []).flatMap((line, index, lines) =>
      line.lineId &&
      (lyricsRepeatRuns(line.text).length ||
        (!adjoiningEqualLyricLines(lines[index - 1], line) &&
          adjoiningEqualLyricLines(line, lines[index + 1])))
        ? [{ lineId: line.lineId, index, text: line.text }]
        : [],
    ),
  );
  // Selection belongs to this exact source/text, not a track or a template.
  watch(
    () =>
      JSON.stringify([
        toValue(sourceKey),
        toValue(document)?.documentId,
        toValue(document)?.source,
        toValue(document)?.lines?.map((line) => [line.lineId, line.text]),
      ]),
    () => {
      overrides.value = new Map();
    },
    { flush: 'sync' },
  );
  watch(
    repeatStorageKey,
    (key) => {
      let entries;
      try {
        entries = key
          ? JSON.parse(globalThis.localStorage?.getItem(key) ?? '[]')
          : [];
      } catch {
        entries = [];
      }
      repeatModes.value =
        repeatDrafts.get(key) ??
        new Map(
          Array.isArray(entries)
            ? entries.filter(
                (entry) =>
                  Array.isArray(entry) &&
                  typeof entry[0] === 'string' &&
                  LYRICS_REPEAT_MODES.includes(entry[1]),
              )
            : [],
        );
    },
    { flush: 'sync', immediate: true },
  );

  function setHidden(lineId, hidden) {
    if (
      typeof hidden !== 'boolean' ||
      !analysis.value.outputCandidates.some((line) => line.lineId === lineId)
    )
      return false;
    overrides.value = new Map(overrides.value).set(lineId, hidden);
    return true;
  }

  function setRepeatMode(lineId, mode) {
    const key = repeatStorageKey.value;
    if (
      !key ||
      (mode !== 'auto' && !LYRICS_REPEAT_MODES.includes(mode)) ||
      !repeatCandidates.value.some((line) => line.lineId === lineId)
    )
      return false;
    const next = new Map(repeatModes.value);
    if (mode === 'auto') next.delete(lineId);
    else next.set(lineId, mode);
    repeatModes.value = next;
    if (next.size) repeatDrafts.set(key, next);
    else repeatDrafts.delete(key);
    try {
      if (next.size)
        globalThis.localStorage?.setItem(key, JSON.stringify([...next]));
      else globalThis.localStorage?.removeItem(key);
    } catch {
      // Keep the source's in-memory settings when renderer storage is unavailable.
    }
    return true;
  }
  return {
    vocalRoles,
    candidates: computed(() => analysis.value.outputCandidates),
    lineRoles: computed(() =>
      lyricsLineVocalRoles(toValue(document), hiddenLineIds.value, options()),
    ),
    hiddenLineIds: readonly(hiddenLineIds),
    repeatCandidates,
    repeatModes: readonly(repeatModes),
    setRepeatMode,
    setHidden,
    restore: () => {
      overrides.value = new Map(
        analysis.value.outputCandidates.map((line) => [line.lineId, false]),
      );
    },
    project: (outputDocument) => {
      const projected = projectLyricsTextSelection(
        outputDocument,
        hiddenLineIds.value,
        options(),
      );
      if (!projected || !repeatModes.value.size) return projected;
      return {
        ...projected,
        lines: projected.lines.map((line) => {
          const repeatMode = repeatModes.value.get(line.lineId);
          return repeatMode ? { ...line, repeatMode } : line;
        }),
      };
    },
  };
}
