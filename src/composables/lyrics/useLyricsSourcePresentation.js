import { computed, shallowRef, toValue, watch } from 'vue';
import { normalizeLyricsDocument } from '../../utils/lyricsDocument.js';
import { sortLyricsSources } from '../../utils/lyrics.js';
import { prepareAcousticPreview } from '../../../shared/presentation/lyricsAcousticPreview.mjs';

// Read-only metadata for source pickers. Never select a source or apply analysis.
export function useLyricsSourcePresentation({
  trackId,
  sources,
  selectedFilename,
  document,
  experiment,
  getBridge = () => window.Utawakui,
}) {
  const details = shallowRef(new Map());
  let request = 0;
  let requested = false;
  let detailsTrackId = null;
  const identity = computed(() =>
    JSON.stringify([toValue(trackId), toValue(sources)]),
  );

  async function refresh() {
    requested = true;
    const generation = ++request;
    const key = identity.value;
    const id = toValue(trackId);
    const list = [...toValue(sources)];
    const bridge = getBridge();
    if (!id || typeof bridge?.getTrackLyrics !== 'function') return;
    const entries = [];
    let index = 0;
    // Bound parallel file reads even for unusually large source collections.
    await Promise.all(
      Array.from({ length: Math.min(3, list.length) }, async () => {
        while (index < list.length && generation === request) {
          const source = list[index++];
          try {
            const [result, estimate] = await Promise.all([
              bridge.getTrackLyrics(id, source.filename),
              Promise.resolve()
                .then(() =>
                  bridge.getExperimentalLyricsEstimate?.(id, source.filename),
                )
                .catch(() => null),
            ]);
            if (!result || typeof result.text !== 'string') continue;
            const canonical = normalizeLyricsDocument({
              text: result.text,
              source: result.source ?? source,
              sourceFingerprint: result.timing?.sourceFingerprint,
              normalizerProfileId: result.timing?.normalizerProfileId,
              timing: result.timing,
            });
            const prepared = prepareAcousticPreview(
              canonical,
              estimate,
              source.offsetMs ?? 0,
            );
            entries.push([
              source.filename,
              {
                sourceKey: JSON.stringify(source),
                timingTier: canonical.granularity,
                hasEstimatedTiming:
                  prepared.status === 'ready' &&
                  prepared.lines.some((line) => line.status === 'ready'),
              },
            ]);
          } catch {
            // Unreadable sources stay unconfirmed, never masquerade as T0.
          }
        }
      }),
    );
    if (generation === request && identity.value === key)
      details.value = new Map(entries);
  }

  const stop = watch(
    identity,
    (_identity, _previous, onCleanup) => {
      request++;
      const id = toValue(trackId);
      const previous = details.value;
      details.value = new Map(
        detailsTrackId === id
          ? toValue(sources).flatMap((source) => {
              const detail = previous.get(source.filename);
              return detail?.sourceKey === JSON.stringify(source)
                ? [[source.filename, detail]]
                : [];
            })
          : [],
      );
      detailsTrackId = id;
      if (requested) void refresh();
      onCleanup(() => {
        request++;
      });
    },
    { immediate: true, flush: 'sync' },
  );

  const availableSources = computed(() =>
    sortLyricsSources(
      toValue(sources).map((source) => {
        const current = source.filename === toValue(selectedFilename);
        const canonical = current ? toValue(document) : null;
        const prepared = current ? experiment?.prepared.value : null;
        const detail = details.value.get(source.filename);
        return {
          ...source,
          ...(detail
            ? {
                timingTier: detail.timingTier,
                hasEstimatedTiming: detail.hasEstimatedTiming,
              }
            : {}),
          ...(canonical?.source?.filename === source.filename
            ? {
                timingTier: canonical.granularity,
                hasEstimatedTiming:
                  prepared?.status === 'ready' &&
                  prepared.lines.some((line) => line.status === 'ready'),
              }
            : {}),
        };
      }),
    ),
  );

  return {
    availableSources,
    refresh,
    stop: () => {
      request++;
      stop();
    },
  };
}
