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
        label="曲庫歌曲"
        placeholder="選擇已有歌詞的歌曲"
        :options="tracks"
        :disabled="research.busy.value"
      />
      <UiSelect
        :id="`${prefix}-language`"
        v-model="language"
        class="lyrics-research__language"
        label="分析語言"
        :options="[
          { value: 'zh', label: '中文' },
          { value: 'ja', label: '日文' },
          { value: 'en', label: '英文' },
        ]"
        :disabled="research.busy.value"
      />
    </div>
    <UiSelect
      :id="`${prefix}-line`"
      v-model="lineIndex"
      class="lyrics-research__line-select"
      label="從哪句開始試算"
      placeholder="選擇有時間的歌詞句"
      :options="lines"
      :disabled="research.busy.value || !lines.length"
    />
    <UiHint v-if="trackId && research.inspection.value"
      >歌詞來源：{{
        research.inspection.value.sourceLabel
      }}。優先使用你選擇的來源，未選擇時依語言挑選。</UiHint
    >
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
      >產生預覽</UiButton
    >
    <div
      v-if="research.preview.value"
      class="lyrics-research__preview"
      aria-label="獨立詞塊預覽"
    >
      <UiHint
        >優先使用原有的逐字時間；分析結果不適用時，仍按整句顯示。此處僅供預覽，不會套用至歌詞或演出畫面。</UiHint
      >
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
                ? '分析分段'
                : line.mode === 'T2'
                  ? '原有逐字時間'
                  : '整句顯示'
            }}</span
          ><UiButton @click="playLine(line)">從本句播放</UiButton>
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
        <UiHint v-if="line.content === 'contradiction'"
          >分析與歌詞內容不一致，已改為整句顯示。</UiHint
        >
        <UiHint v-if="line.content === 'possible-missing-lyrics'"
          >可能有缺漏歌詞，請播放確認。</UiHint
        >
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
