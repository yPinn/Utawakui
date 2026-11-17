import { computed, shallowRef, watch } from 'vue';
import { t } from '../utils/i18n.js';
import translationValues from '../../shared/lyricsTranslationValues.json';

export const translationLanguageLabels = {
  'zh-TW': () => t('lyricsTranslation.traditionalChinese'),
  en: () => t('lyricsTranslation.english'),
};

// A save from one view (editor) reaches the others (video, Output) at once.
const latestSaved = shallowRef(null);
let sequence = 0;
const contextKey = (context) =>
  `${context.trackId}\0${context.filename}\0${context.documentId}`;

export function useLyricsTranslations(lyrics) {
  const languages = translationValues.languages.map((id) => ({
    id,
    label: translationLanguageLabels[id](),
  }));
  const context = computed(() => {
    const session = lyrics.sourceSession?.value;
    const trackId = lyrics.selectedTrack.value?.id;
    const filename = lyrics.selectedSource.value?.filename;
    const { documentId, lines, source } = lyrics.lyricsDocument.value;
    if (
      lyrics.linkedReference?.value ||
      lyrics.state.isLoadingLyrics ||
      !session ||
      !trackId ||
      !filename ||
      !documentId ||
      source?.filename !== filename ||
      !lines?.length
    )
      return null;
    return { trackId, filename, session: { ...session }, documentId, lines };
  });

  const loaded = shallowRef(null);
  const failure = shallowRef(null);
  const reload = shallowRef(0);
  const record = computed(() => {
    const own = loaded.value?.context === context.value ? loaded.value : null;
    const shared = latestSaved.value;
    if (
      own &&
      shared?.key === contextKey(context.value) &&
      shared.sequence > own.sequence
    )
      return shared.record;
    return own?.record ?? null;
  });
  const loadError = computed(
    () => context.value !== null && failure.value === context.value,
  );

  function store(record, current) {
    loaded.value = { context: current, record, sequence: ++sequence };
  }

  function applySaved(saved, editedContext) {
    if (context.value !== editedContext) return;
    store(saved, editedContext);
    latestSaved.value = {
      key: contextKey(editedContext),
      record: saved,
      sequence: loaded.value.sequence,
    };
  }

  watch(
    [context, reload],
    async ([current], _previous, onCleanup) => {
      loaded.value = null;
      failure.value = null;
      const api = globalThis.window?.Utawakui;
      if (!current || typeof api?.getLyricsTranslations !== 'function') return;

      let active = true;
      onCleanup(() => {
        active = false;
      });
      try {
        const { trackId, filename, session, documentId } = current;
        const result = await api.getLyricsTranslations(
          trackId,
          filename,
          session,
          documentId,
        );
        if (active && context.value === current) store(result, current);
      } catch {
        if (active) failure.value = current;
      }
    },
    { immediate: true },
  );

  return {
    languages,
    context,
    record,
    loadError,
    retry: () => reload.value++,
    applySaved,
  };
}
