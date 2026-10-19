<script setup>
import { computed, onUnmounted, shallowRef, useId, watch } from 'vue';
import { useLyricsResearch } from '../../composables/lyrics/useLyricsResearch.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePlayer } from '../../composables/usePlayer.js';
import SettingsSection from './SettingsSection.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';
const research = useLyricsResearch();
const library = useLibrary();
const player = usePlayer();
const open = shallowRef(false),
  trackId = shallowRef(''),
  language = shallowRef('zh'),
  lineIndex = shallowRef(0);
const prefix = `lyrics-research-${useId()}`;
let timer, unsubscribe;
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
  (research.inspection.value?.lines ?? [])
    .filter(
      (line) =>
        Number.isSafeInteger(line.startMs) && Number.isSafeInteger(line.endMs),
    )
    .map((line) => ({
      value: line.index,
      label: `${seconds(line.startMs)} · ${line.text}`,
    })),
);
const statusLabel = computed(
  () =>
    ({
      missing: '未下載',
      unverified: '待驗證載入',
      ready: '環境已驗證',
      damaged: '需要修復',
    })[research.status.value?.status] ?? '尚未讀取',
);
const stageLabel = computed(() => {
  const stage = research.status.value?.stage ?? '';
  if (stage.startsWith('download:')) return `下載中：${stage.slice(9)}`;
  return (
    {
      prepare: '準備中',
      verify: '驗證模型載入中',
      extract: '解壓縮中',
      preview: '等待試算',
      hubertfa: 'HubertFA 詞塊分析中',
      small: 'Whisper small 內容檢查中',
      remove: '移除中',
    }[stage] || '研究操作中'
  );
});
watch(open, async (value) => {
  clearInterval(timer);
  unsubscribe?.();
  if (!value) return;
  research.clearPreview();
  await Promise.all([research.refresh(), library.initialize()]);
  if (!open.value) return;
  timer = setInterval(() => {
    if (research.busy.value) void research.refresh();
  }, 1000);
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
  clearInterval(timer);
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
  <SettingsSection title="本機歌詞研究試用">
    <SettingsDocumentItem
      title="HubertFA ＋ Whisper small"
      description="手動準備中／日詞塊試算環境。結果僅在此預覽，時間精度待人工驗收。"
    >
      <template #actions>
        <UiButton
          variant="secondary"
          :aria-expanded="open"
          :aria-controls="`${prefix}-body`"
          @click="open = !open"
          >{{ open ? '收起研究試用' : '開啟研究試用' }}</UiButton
        >
      </template>
    </SettingsDocumentItem>
    <div v-if="open" :id="`${prefix}-body`" class="lyrics-research">
      <UiHint
        >HubertFA 權重與字典的使用／分發授權尚待釐清；僅提供本機研究試用。正式
        gate 與預設下載維持不變。</UiHint
      >
      <p class="lyrics-research__capacity">
        下載約 0.78 GB，安裝約 1.00 GB；另需已準備的 FFmpeg
        與暫存空間，建議至少預留 4 GB。先在上方準備 App 管理的 FFmpeg。
      </p>
      <div class="lyrics-research__actions">
        <span role="status">{{
          research.busy.value ? stageLabel : statusLabel
        }}</span>
        <UiButton
          :disabled="research.busy.value || !research.status.value"
          variant="secondary"
          @click="research.action('prepare')"
          >{{
            research.status.value?.status === 'missing'
              ? '手動下載研究環境'
              : '重新下載修復'
          }}</UiButton
        >
        <UiButton
          :disabled="
            research.busy.value ||
            !research.status.value ||
            research.status.value.status === 'missing'
          "
          variant="secondary"
          @click="research.action('verify')"
          >驗證載入</UiButton
        >
        <UiButton
          :disabled="
            research.busy.value ||
            !research.status.value ||
            research.status.value.status === 'missing'
          "
          intent="danger"
          @click="research.action('remove')"
          >移除研究環境</UiButton
        >
        <UiButton
          v-if="research.busy.value"
          variant="secondary"
          @click="research.cancel"
          >取消並等待清理</UiButton
        >
        <UiButton v-else @click="research.refresh">重新讀取</UiButton>
      </div>
      <p
        v-if="research.error.value"
        role="alert"
        class="lyrics-research__error"
      >
        {{ research.error.value }}
      </p>
      <div class="lyrics-research__fields">
        <UiSelect
          :id="`${prefix}-track`"
          v-model="trackId"
          label="曲庫歌曲"
          placeholder="選擇已有歌詞的歌曲"
          :options="tracks"
          :disabled="research.busy.value"
        />
        <UiSelect
          :id="`${prefix}-language`"
          v-model="language"
          label="分析語言"
          :options="[
            { value: 'zh', label: '中文' },
            { value: 'ja', label: '日文' },
          ]"
          :disabled="research.busy.value"
        />
      </div>
      <UiSelect
        :id="`${prefix}-line`"
        v-model="lineIndex"
        label="從哪句開始試算"
        placeholder="選擇有時間的歌詞句"
        :options="lines"
        :disabled="research.busy.value || !lines.length"
      />
      <UiHint v-if="research.inspection.value"
        >來源：{{
          research.inspection.value.sourceLabel
        }}。採曲庫偏好來源，未設定則採對應語言；每次約 30 秒，最多 10
        句。</UiHint
      >
      <UiButton
        variant="accent"
        :disabled="
          research.busy.value ||
          research.status.value?.status !== 'ready' ||
          !lines.length
        "
        @click="research.action('preview', intent())"
        >產生本段詞塊預覽</UiButton
      >
      <div
        v-if="research.preview.value"
        class="lyrics-research__preview"
        aria-label="獨立詞塊預覽"
      >
        <UiHint
          >原生 T2 優先；內容矛盾或無可用詞塊時回退
          T1。漏詞提示不補字、不改時間。此預覽不套用至正式歌詞或
          OBS，人工時間驗收待完成。</UiHint
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
                  ? '研究詞塊'
                  : `${line.mode} 回退／原生`
              }}</span
            ><UiButton @click="playLine(line)">從本句播放</UiButton>
          </div>
          <p v-if="!pieces(line).length">{{ line.text }}</p>
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
              >{{ piece.text }}<small>{{ seconds(piece.startMs) }}</small></span
            >
          </p>
          <UiHint v-if="line.content === 'contradiction'"
            >內容不一致，已收起研究詞塊。</UiHint
          >
          <UiHint v-if="line.content === 'possible-missing-lyrics'"
            >疑似漏詞，請聽查確認。</UiHint
          >
        </article>
      </div>
    </div>
  </SettingsSection>
</template>

<style scoped>
.lyrics-research {
  display: grid;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4);
  min-inline-size: 0;
}
.lyrics-research__capacity {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
}
.lyrics-research__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  align-items: center;
}
.lyrics-research__fields {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-3);
}
.lyrics-research__error {
  margin: 0;
  color: var(--ui-color-danger);
}
.lyrics-research__line {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
  padding-block: var(--ui-space-3);
}
.lyrics-research__chunks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}
.lyrics-research__chunks small {
  display: block;
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}
.lyrics-research__chunk--active {
  color: var(--ui-color-accent);
}
@container settings-section (max-width: 30rem) {
  .lyrics-research__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
