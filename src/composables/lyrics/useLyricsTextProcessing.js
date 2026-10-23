import { computed, readonly, shallowRef, toValue, watch } from 'vue';
import {
  preprocessLyricsDocument,
  projectLyricsTextSelection,
} from '../../../shared/presentation/lyricsTextProcessing.mjs';

export function useLyricsTextProcessing({ document, sourceKey }) {
  const hiddenLineIds = shallowRef([]);
  const analysis = computed(() => preprocessLyricsDocument(toValue(document)));
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
      hiddenLineIds.value = [];
    },
    { flush: 'sync' },
  );

  function setHidden(lineId, hidden) {
    if (
      typeof hidden !== 'boolean' ||
      !analysis.value.creditCandidates.some((line) => line.lineId === lineId)
    )
      return false;
    const next = new Set(hiddenLineIds.value);
    if (hidden) next.add(lineId);
    else next.delete(lineId);
    hiddenLineIds.value = [...next];
    return true;
  }
  return {
    candidates: computed(() => analysis.value.creditCandidates),
    hiddenLineIds: readonly(hiddenLineIds),
    setHidden,
    restore: () => {
      hiddenLineIds.value = [];
    },
    project: (outputDocument) =>
      projectLyricsTextSelection(outputDocument, hiddenLineIds.value),
  };
}
