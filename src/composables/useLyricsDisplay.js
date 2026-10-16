import { computed, shallowRef, watch, onScopeDispose } from 'vue';
import { alignReadings, detectLyricsScript } from '../utils/lyrics.js';
const SUPPORTED_READING_SCRIPTS = new Set(['ja', 'ko']);
const LYRICS_FONT_SIZE_CLASSES = [
  'lyrics-preview--font-compact',
  'lyrics-preview--font-default',
  'lyrics-preview--font-large',
];
const LYRICS_FONT_SIZE_LABELS = ['小', '標準', '大'];

// Session-only display preference survives switching between contextual readers.
const lyricsFontSizeIndex = shallowRef(1);
export function useLyricsDisplay({ lyrics, reading }) {
  const { state, selectedTrack, selectedSource, lyricsDocument, lyricLines } =
    lyrics;
  const {
    variant: readingVariant,
    getDoc: getReadingDoc,
    isGenerating: isGeneratingReadingFor,
    errorFor: readingErrorFor,
    loadReading,
    generateReading,
    setVariant: setReadingVariant,
  } = reading;
  const preparingReadingKey = shallowRef('');
  const readingPreparations = new Map();
  let disposed = false;
  onScopeDispose(() => {
    disposed = true;
  });
  const lyricsScript = computed(() =>
    detectLyricsScript(lyricLines.value.map((line) => line.text).join('')),
  );
  const showsReadingAid = computed(() =>
    SUPPORTED_READING_SCRIPTS.has(lyricsScript.value),
  );
  const readingOptions = computed(() => {
    if (lyricsScript.value === 'ja') {
      return [
        { id: 'off', label: '關閉' },
        { id: 'furigana', label: '假名' },
        { id: 'romaji', label: '羅馬字' },
      ];
    }
    if (lyricsScript.value === 'ko') {
      return [
        { id: 'off', label: '關閉' },
        { id: 'romaji', label: '羅馬字' },
      ];
    }
    return [];
  });
  const selectedReadingDoc = computed(() => {
    const track = selectedTrack.value;
    const source = selectedSource.value;
    return track && source ? getReadingDoc(track.id, source.filename) : null;
  });
  const readingLines = computed(() =>
    alignReadings(lyricLines.value, selectedReadingDoc.value),
  );
  const lyricsFontSizeClass = computed(
    () => LYRICS_FONT_SIZE_CLASSES[lyricsFontSizeIndex.value],
  );
  const lyricsFontSizeLabel = computed(
    () => LYRICS_FONT_SIZE_LABELS[lyricsFontSizeIndex.value],
  );
  const canDecreaseLyricsFontSize = computed(
    () => lyricsFontSizeIndex.value > 0,
  );
  const canIncreaseLyricsFontSize = computed(
    () => lyricsFontSizeIndex.value < LYRICS_FONT_SIZE_CLASSES.length - 1,
  );
  const readingKey = computed(() => {
    const track = selectedTrack.value;
    const source = selectedSource.value;
    const document = lyricsDocument.value;
    return track && source
      ? JSON.stringify([
          track.id,
          source.filename,
          document?.documentId,
          document?.normalizerProfileId,
          document?.source?.sha256,
          lyricsScript.value,
        ])
      : '';
  });
  const isGeneratingReading = computed(() => {
    const track = selectedTrack.value;
    const source = selectedSource.value;
    return Boolean(
      track && source && isGeneratingReadingFor(track.id, source.filename),
    );
  });
  const readingError = computed(() => {
    const track = selectedTrack.value;
    const source = selectedSource.value;
    return track && source ? readingErrorFor(track.id, source.filename) : null;
  });
  const isPreparingReading = computed(
    () =>
      preparingReadingKey.value !== '' &&
      preparingReadingKey.value === readingKey.value,
  );

  async function loadSelectedReading() {
    const track = selectedTrack.value;
    const source = selectedSource.value;
    if (disposed || !track || !source || state.isLoadingLyrics) return;
    return loadReading(track.id, source.filename, lyricsDocument.value);
  }

  function prepareSelectedReading() {
    const track = selectedTrack.value;
    const source = selectedSource.value;
    if (
      disposed ||
      !track ||
      !source ||
      state.isLoadingLyrics ||
      !showsReadingAid.value ||
      readingVariant.value === 'off' ||
      !lyricLines.value.length
    )
      return;
    const key = readingKey.value;
    if (readingPreparations.has(key)) return readingPreparations.get(key);
    const document = lyricsDocument.value;
    const lines = lyricLines.value;
    const script = lyricsScript.value;
    const isCurrent = () =>
      !disposed &&
      readingKey.value === key &&
      readingVariant.value !== 'off' &&
      !state.isLoadingLyrics;
    preparingReadingKey.value = key;
    const request = (async () => {
      const stored = await loadReading(track.id, source.filename, document);
      // Undefined means failed/unverifiable, not a missing sidecar.
      if (!isCurrent() || stored === undefined) return;
      if (alignReadings(lines, stored).some(Boolean)) return;
      if (!isGeneratingReadingFor(track.id, source.filename)) {
        await generateReading(track.id, source.filename, document, script);
      }
    })().finally(() => {
      readingPreparations.delete(key);
      if (preparingReadingKey.value === key) preparingReadingKey.value = '';
    });
    readingPreparations.set(key, request);
    return request;
  }

  function selectReadingVariant(variant) {
    const next =
      variant === 'furigana' && lyricsScript.value === 'ko'
        ? 'romaji'
        : variant;
    setReadingVariant(
      readingOptions.value.some((option) => option.id === next) ? next : 'off',
    );
    if (readingVariant.value !== 'off') return prepareSelectedReading();
  }

  function decreaseLyricsFontSize() {
    lyricsFontSizeIndex.value = Math.max(0, lyricsFontSizeIndex.value - 1);
  }

  function increaseLyricsFontSize() {
    lyricsFontSizeIndex.value = Math.min(
      LYRICS_FONT_SIZE_CLASSES.length - 1,
      lyricsFontSizeIndex.value + 1,
    );
  }

  watch(
    [lyricsScript, () => state.isLoadingLyrics],
    ([script]) => {
      if (!lyricLines.value.length || state.isLoadingLyrics) return;
      if (!SUPPORTED_READING_SCRIPTS.has(script)) setReadingVariant('off');
      else if (script === 'ko' && readingVariant.value === 'furigana') {
        setReadingVariant('romaji');
      }
    },
    { immediate: true },
  );

  watch(
    [readingKey, () => state.isLoadingLyrics, readingVariant],
    () => {
      void refreshSelectedReading();
    },
    { immediate: true },
  );

  function refreshSelectedReading() {
    return readingVariant.value === 'off' || !showsReadingAid.value
      ? loadSelectedReading()
      : prepareSelectedReading();
  }
  return {
    lyricsScript,
    showsReadingAid,
    readingOptions,
    selectedReadingDoc,
    readingLines,
    lyricsFontSizeClass,
    lyricsFontSizeLabel,
    canDecreaseLyricsFontSize,
    canIncreaseLyricsFontSize,
    readingVariant,
    readingError,
    isPreparingReading,
    isGeneratingReading,
    selectReadingVariant,
    decreaseLyricsFontSize,
    increaseLyricsFontSize,
    refreshSelectedReading,
  };
}
