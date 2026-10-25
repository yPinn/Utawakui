import { computed, readonly, shallowRef, toValue, watch } from 'vue';
import { useLyricsVocalRoles } from './useLyricsVocalRoles.js';
import {
  lyricsLineVocalRoles,
  preprocessLyricsDocument,
  projectLyricsTextSelection,
} from '../../../shared/presentation/lyricsTextProcessing.mjs';

export function useLyricsTextProcessing({
  document,
  sourceKey,
  performers,
  trackId,
  reportError,
}) {
  const vocalRoles = useLyricsVocalRoles({ document, trackId, reportError });
  const overrides = shallowRef(new Map());
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

  function setHidden(lineId, hidden) {
    if (
      typeof hidden !== 'boolean' ||
      !analysis.value.outputCandidates.some((line) => line.lineId === lineId)
    )
      return false;
    overrides.value = new Map(overrides.value).set(lineId, hidden);
    return true;
  }
  return {
    vocalRoles,
    candidates: computed(() => analysis.value.outputCandidates),
    lineRoles: computed(() =>
      lyricsLineVocalRoles(toValue(document), hiddenLineIds.value, options()),
    ),
    hiddenLineIds: readonly(hiddenLineIds),
    setHidden,
    restore: () => {
      overrides.value = new Map(
        analysis.value.outputCandidates.map((line) => [line.lineId, false]),
      );
    },
    project: (outputDocument) =>
      projectLyricsTextSelection(
        outputDocument,
        hiddenLineIds.value,
        options(),
      ),
  };
}
