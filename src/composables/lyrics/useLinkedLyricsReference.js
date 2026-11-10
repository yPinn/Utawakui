import { computed, shallowRef, watch } from 'vue';
import { pickPreferredLyricsSource } from '../../utils/lyrics.js';
import { trackTitlePresentation } from '../../utils/trackTitlePresentation.js';
import {
  isLegacyReferenceLabel,
  normalizeLyricsDocument,
  referenceLyricsDraft,
} from '../../utils/lyricsDocument.js';
import { lyricsTextVariantLoader } from '../../utils/lyricsTextVariantLoader.js';

export function useLinkedLyricsReference({
  state,
  selectedTrack,
  selectedLyrics,
  tracksById,
  lyricsTiming,
  selectSource,
  copyLinkedReference,
}) {
  // The reference participates in playback without granting authoring authority.
  const hiddenLegacyReference = shallowRef('');
  const isHidden = computed(
    () =>
      state.selectedSourceFilename === '' ||
      hiddenLegacyReference.value === state.selectedTrackId,
  );
  const linkedReferenceCandidate = computed(() => {
    const cover = selectedTrack.value;
    const link = cover?.workPresentation;
    if (link?.relationship !== 'cover' || !link.referenceTrackId) return null;
    const reference = tracksById.value.get(link.referenceTrackId);
    const source = pickPreferredLyricsSource(reference);
    if (!reference || !source) return null;
    const title = trackTitlePresentation(reference).title;
    const sources = selectedLyrics.value.sources;
    const [ownSource] = sources;
    // The previous Apply action saved an ordinary manual source with this label.
    const legacyFilename =
      sources.length === 1 &&
      ownSource.kind === 'manual' &&
      !ownSource.offsetMs &&
      isLegacyReferenceLabel(ownSource.label, title)
        ? ownSource.filename
        : null;
    if (sources.length && !legacyFilename) return null;
    return {
      reference,
      title,
      legacyFilename,
      filename: source.filename,
      key: JSON.stringify([
        cover.id,
        link.workId,
        reference.id,
        source,
        title,
        legacyFilename,
      ]),
    };
  });
  const linkedReferenceRequest = computed(() => {
    const candidate = linkedReferenceCandidate.value;
    return !isHidden.value &&
      candidate &&
      state.selectedSourceFilename === candidate.legacyFilename
      ? candidate
      : null;
  });
  const loadedLinkedReference = shallowRef(null);
  const linkedReference = computed(() => {
    const request = linkedReferenceRequest.value;
    const loaded = loadedLinkedReference.value;
    if (!request || loaded?.key !== request.key) return null;
    if (
      request.legacyFilename &&
      (state.isLoadingLyrics ||
        state.lyricSource?.filename !== request.legacyFilename ||
        state.offsetSeconds !== 0 ||
        lyricsTiming.value.status !== 'missing' ||
        !loaded.legacyText ||
        state.lyricsText.trim() !== loaded.legacyText)
    )
      return null;
    return loaded;
  });
  const stopLinkedReference = watch(
    () => linkedReferenceRequest.value?.key,
    async (key, _previous, onCleanup) => {
      loadedLinkedReference.value = null;
      const request = linkedReferenceRequest.value;
      if (!key || !request || !window.Utawakui?.getTrackLyricsReference) return;
      let active = true;
      onCleanup(() => {
        active = false;
      });
      try {
        const result = await window.Utawakui.getTrackLyricsReference(
          request.reference.id,
          request.filename,
          true,
        );
        if (!active || linkedReferenceRequest.value?.key !== key || !result)
          return;
        const document = normalizeLyricsDocument({
          ...result,
          sourceFingerprint: result.timing?.sourceFingerprint,
          normalizerProfileId: result.timing?.normalizerProfileId,
        });
        if (!document.lines.length) return;
        await lyricsTextVariantLoader.prepare(document);
        if (!active || linkedReferenceRequest.value?.key !== key) return;
        loadedLinkedReference.value = {
          key,
          title: request.title,
          document,
          legacyText: request.legacyFilename
            ? referenceLyricsDraft(result)
            : '',
          offsetSeconds: (result.source?.offsetMs ?? 0) / 1000,
        };
      } catch {
        // An unavailable optional reference leaves the normal empty state usable.
      }
    },
  );
  async function applyLinkedReference() {
    const request = linkedReferenceRequest.value;
    if (!request || !linkedReference.value) return null;
    return copyLinkedReference(request.reference.id, request.filename);
  }
  function toggleLinkedReference() {
    if (linkedReferenceCandidate.value?.legacyFilename) {
      hiddenLegacyReference.value = linkedReference.value
        ? state.selectedTrackId
        : '';
    } else {
      selectSource(linkedReference.value ? '' : null);
    }
  }

  return {
    linkedReference,
    applyLinkedReference,
    hasLinkedReference: computed(() => Boolean(linkedReferenceCandidate.value)),
    toggleLinkedReference,
    isHidden,
    stop: stopLinkedReference,
  };
}
