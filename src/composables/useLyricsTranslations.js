import { computed, shallowRef, watch } from 'vue';
import { t } from '../utils/i18n.js';

export function useLyricsTranslations(lyrics) {
  const languages = [
    { id: 'zh-TW', label: t('lyricsTranslation.traditionalChinese') },
    { id: 'en', label: t('lyricsTranslation.english') },
  ];
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
  const record = computed(() =>
    loaded.value?.context === context.value ? loaded.value.record : null,
  );
  const loadError = computed(
    () => context.value !== null && failure.value === context.value,
  );

  function applySaved(saved, editedContext) {
    if (context.value === editedContext)
      loaded.value = { context: editedContext, record: saved };
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
        if (active) applySaved(result, current);
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
