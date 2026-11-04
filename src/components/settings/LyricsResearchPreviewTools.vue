<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  useId,
  watch,
} from 'vue';
import { useLyricsResearch } from '../../composables/lyrics/useLyricsResearch.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlayer } from '../../composables/usePlayer.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';
import { t } from '../../utils/i18n.js';
const research = useLyricsResearch();
const library = useLibrary();
const player = usePlayer();
const trackId = shallowRef(''),
  language = shallowRef('zh'),
  lineIndex = shallowRef(0);
const prefix = `lyrics-research-${useId()}`;
let unsubscribe;
const intent = () => ({
  trackId: trackId.value,
  language: language.value,
  lineIndex: lineIndex.value,
});
const tracks = computed(() =>
  library.state.tracks.map((t) => ({
    value: t.id,
    label: `${t.title}${t.artist ? ` · ${t.artist}` : ''}`,
  })),
);
const lines = computed(() =>
  (trackId.value ? (research.inspection.value?.lines ?? []) : [])
    .filter(
      (line) =>
        Number.isSafeInteger(line.startMs) && Number.isSafeInteger(line.endMs),
    )
    .map((line) => ({
      value: line.index,
      label: `${seconds(line.startMs)} · ${line.text}`,
    })),
);
onMounted(() => {
  research.clearPreview();
  void library.initialize();
  unsubscribe = window.Utawakui?.onLibraryUpdated?.(() => {
    research.clearPreview();
    void research.inspect(intent());
  });
});
watch([trackId, language], () => {
  lineIndex.value = 0;
  void research.inspect(intent());
});
watch(lines, (options) => {
  if (options.length && !options.some((o) => o.value === lineIndex.value))
    lineIndex.value = options[0].value;
});
watch(lineIndex, () => research.clearPreview());
onUnmounted(() => {
  research.clearPreview();
  unsubscribe?.();
});
function seconds(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}
function pieces(line) {
  if (line.mode === 'T2') return line.segments;
  return line.chunks.map((chunk) => ({
    ...chunk,
    text: line.text.slice(chunk.from, chunk.to),
  }));
}
function active(piece, next, line) {
  const clock =
    player.state.currentTime * 1000 + (research.preview.value?.offsetMs ?? 0);
  return (
    player.state.track?.id === trackId.value &&
    clock >= piece.startMs &&
    clock < (next?.startMs ?? line.endMs)
  );
}
async function playLine(line) {
  const track = library.state.tracks.find((t) => t.id === trackId.value);
  if (!track) return;
  if (player.state.track?.id !== track.id && !(await player.playTrack(track)))
    return;
  player.seek(
    Math.max(
      0,
      (line.startMs - (research.preview.value?.offsetMs ?? 0)) / 1000,
    ),
  );
  await player.play();
}
</script>

<template>
  <div class="lyrics-research">
    <div class="lyrics-research__fields">
      <UiSelect
        :id="`${prefix}-track`"
        v-model="trackId"
        class="lyrics-research__track"
        :label="t('lyricsResearch.preview.track')"
        :placeholder="t('lyricsResearch.preview.trackPlaceholder')"
        :options="tracks"
        :disabled="research.busy.value"
      />
      <UiSelect
        :id="`${prefix}-language`"
        v-model="language"
        class="lyrics-research__language"
        :label="t('lyricsResearch.preview.language')"
        :options="[
          { value: 'zh', label: t('lyricsResearch.languages.zh') },
          { value: 'ja', label: t('lyricsResearch.languages.ja') },
          { value: 'en', label: t('lyricsResearch.languages.en') },
        ]"
        :disabled="research.busy.value"
      />
    </div>
    <UiSelect
      :id="`${prefix}-line`"
      v-model="lineIndex"
      class="lyrics-research__line-select"
      :label="t('lyricsResearch.preview.line')"
      :placeholder="t('lyricsResearch.preview.linePlaceholder')"
      :options="lines"
      :disabled="research.busy.value || !lines.length"
    />
    <UiHint v-if="trackId && research.inspection.value">{{
      t('lyricsResearch.preview.source', {
        source: research.inspection.value.sourceLabel,
      })
    }}</UiHint>
    <UiButton
      class="lyrics-research__generate"
      variant="accent"
      :disabled="
        research.busy.value ||
        research.status.value?.status !== 'ready' ||
        !trackId ||
        !lines.length
      "
      @click="research.action('preview', intent())"
      >{{ t('lyricsResearch.preview.generate') }}</UiButton
    >
    <div
      v-if="research.preview.value"
      class="lyrics-research__preview"
      :aria-label="t('lyricsResearch.preview.label')"
    >
      <UiHint>{{ t('lyricsResearch.preview.hint') }}</UiHint>
      <article
        v-for="line in research.preview.value.lines"
        :key="line.lineId"
        class="lyrics-research__line"
      >
        <div class="lyrics-research__actions">
          <span
            >{{ seconds(line.startMs) }} ·
            {{
              line.mode === 'research'
                ? t('lyricsResearch.preview.modeResearch')
                : line.mode === 'T2'
                  ? t('lyricsEditor.phrase.timingWord')
                  : t('lyricsEditor.acoustic.timingPlain')
            }}</span
          ><UiButton @click="playLine(line)">{{
            t('lyricsResearch.preview.playLine')
          }}</UiButton>
        </div>
        <p v-if="!pieces(line).length" class="lyrics-research__text">
          {{ line.text }}
        </p>
        <p v-else class="lyrics-research__chunks">
          <span
            v-for="(piece, index) in pieces(line)"
            :key="index"
            :class="{
              'lyrics-research__chunk--active': active(
                piece,
                pieces(line)[index + 1],
                line,
              ),
            }"
            >{{ piece.text
            }}<span class="lyrics-research__time">{{
              seconds(piece.startMs)
            }}</span></span
          >
        </p>
        <UiHint v-if="line.content === 'contradiction'">{{
          t('lyricsResearch.preview.contradiction')
        }}</UiHint>
        <UiHint v-if="line.content === 'possible-missing-lyrics'">{{
          t('lyricsResearch.preview.missing')
        }}</UiHint>
      </article>
    </div>
  </div>
</template>

<style scoped>
.lyrics-research {
  display: grid;
  gap: var(--ui-space-4);
  min-inline-size: 0;
}
.lyrics-research__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  align-items: center;
  justify-content: space-between;
}
.lyrics-research__generate {
  justify-self: end;
}
.lyrics-research__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: var(--ui-space-3);
}
.lyrics-research__track,
.lyrics-research__line-select {
  inline-size: var(--settings-long-text-inline-size);
  min-inline-size: min(100%, 20ch);
  max-inline-size: 100%;
}
.lyrics-research__language {
  inline-size: var(--settings-select-inline-size);
  min-inline-size: min(100%, 6ic);
  max-inline-size: 100%;
}
.lyrics-research__line {
  display: grid;
  gap: var(--ui-space-2);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  padding-block: var(--ui-space-3);
}
.lyrics-research__chunks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}
.lyrics-research__text,
.lyrics-research__chunks {
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-body-weight);
  line-height: var(--ui-type-body-line-height);
}
.lyrics-research__time {
  display: block;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}
.lyrics-research__chunk--active {
  color: var(--ui-color-accent);
}
</style>
