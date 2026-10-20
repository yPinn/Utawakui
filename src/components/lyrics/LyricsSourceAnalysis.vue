<script setup>
import { computed, onScopeDispose, shallowRef, useId, watch } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { useExperimentalLyricsQueue } from '../../composables/lyrics/useExperimentalLyricsQueue.js';
import { formatLyricsSourceLabel } from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';

const props = defineProps({
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});
const lyrics = useLyrics();
const experiment = lyrics.experimentalLyrics;
const queue = useExperimentalLyricsQueue();
const language = shallowRef('auto'),
  saving = shallowRef(false);
const languageId = `lyrics-source-analysis-${useId()}`;
const languageOptions = [
  { value: 'auto', label: '自動辨識' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日文' },
];
const sourceLabel = computed(() =>
  lyrics.selectedSource.value
    ? formatLyricsSourceLabel(lyrics.selectedSource.value)
    : '尚未選用',
);
const lines = computed(() => lyrics.lyricsDocument.value?.lines ?? []);
const hasT1 = computed(() =>
  lines.value.some(
    (line) =>
      !line.segments?.length &&
      Number.isFinite(line.startMs) &&
      Number.isFinite(line.endMs),
  ),
);
const nativeOnly = computed(
  () => !hasT1.value && lines.value.some((line) => line.segments?.length),
);
const item = computed(() =>
  queue.state.value?.items?.find(
    (entry) => entry.trackId === lyrics.state.selectedTrackId,
  ),
);
const busy = computed(() =>
  ['pending', 'running'].includes(item.value?.status),
);
const currentItem = computed(() =>
  !item.value?.sourceFilename ||
  item.value.sourceFilename === lyrics.state.selectedSourceFilename
    ? item.value
    : null,
);
const readyCount = computed(() =>
  experiment.prepared.value.status === 'ready'
    ? experiment.prepared.value.lines.filter((line) => line.status === 'ready')
        .length
    : 0,
);
const blocked = computed(() =>
  Boolean(
    props.disabled ||
    saving.value ||
    lyrics.state.isLoadingLyrics ||
    lyrics.state.offsetSave?.isSaving ||
    lyrics.state.offsetSave?.error ||
    lyrics.state.timingSave?.isSaving,
  ),
);
const canAnalyze = computed(
  () =>
    !blocked.value &&
    !busy.value &&
    hasT1.value &&
    queue.state.value?.enabled &&
    queue.state.value.allowed &&
    !['missing', 'damaged'].includes(queue.state.value.environmentStatus),
);
const availability = computed(() => {
  if (nativeOnly.value) return '來源 T2 已提供逐字時間，直接沿用，不需要分析。';
  if (!hasT1.value) return '目前來源沒有可分析的整句時間，請先準備時間歌詞。';
  if (!queue.state.value) return '正在確認分析設定。';
  if (!queue.state.value.allowed) return '請先至設定啟用音訊處理功能。';
  if (!queue.state.value.enabled)
    return '請先至設定啟用實驗性歌詞分析；不會自動下載工具。';
  if (['missing', 'damaged'].includes(queue.state.value.environmentStatus))
    return '請先至設定準備或修復歌詞分析工具。';
  if (lyrics.state.offsetSave?.isSaving)
    return '正在儲存校時，完成後才能分析。';
  if (lyrics.state.offsetSave?.error)
    return '校時尚未儲存，請先重試校時，再分析。';
  return '';
});
const jobDescription = computed(() => {
  if (busy.value)
    return item.value.sourceFilename && !currentItem.value
      ? '此曲的其他來源正在分析，可取消後分析目前來源。'
      : item.value.status === 'pending'
        ? '等待分析；完成後仍需手動套用。'
        : '正在準備環境與分析；完成後仍需手動套用。';
  if (currentItem.value?.status === 'failed')
    return '分析失敗；原有歌詞與伴奏仍可使用，可重新分析。';
  if (currentItem.value?.status === 'cancelled')
    return '分析已取消；原有歌詞與伴奏仍可使用。';
  if (currentItem.value?.status !== 'skipped') return '';
  return (
    {
      'source-changed': '選用來源已變更，請確認目前來源後重新分析。',
      'language-unknown': '無法可靠辨識歌詞語言，請指定中文或日文後重試。',
      'language-unsupported': '目前支援中文與日文，請確認後指定分析語言。',
      'lyrics-missing': '沒有歌詞來源，請先加入時間歌詞。',
      'untimed-lyrics': '目前來源沒有可分析的整句時間。',
      'native-t2': '來源 T2 已提供逐字時間，直接沿用。',
      'environment-missing': '請先至設定準備歌詞分析工具。',
    }[currentItem.value.reason] ?? '目前來源無法分析，請確認語言與整句時間。'
  );
});
const hasPrevious = computed(
  () =>
    experiment.needsReanalysis.value ||
    !['missing', 'disabled'].includes(experiment.estimate.value.status),
);
async function analyze() {
  if (!canAnalyze.value) return;
  const trackId = lyrics.state.selectedTrackId,
    filename = lyrics.state.selectedSourceFilename;
  saving.value = true;
  try {
    await queue.retry(trackId, language.value, filename);
  } finally {
    saving.value = false;
  }
}
async function cancel() {
  if (saving.value) return;
  saving.value = true;
  try {
    await queue.cancel(lyrics.state.selectedTrackId);
  } finally {
    saving.value = false;
  }
}
let timer;
watch(
  () => props.active,
  (active) => {
    clearInterval(timer);
    if (active) {
      void queue.refresh();
      timer = setInterval(() => {
        void queue.refresh();
      }, 1000);
    }
  },
  { immediate: true },
);
watch(
  () => [lyrics.state.selectedTrackId, lyrics.state.selectedSourceFilename],
  () => {
    language.value = 'auto';
  },
);
onScopeDispose(() => clearInterval(timer));
</script>

<template>
  <section
    v-if="active"
    class="lyrics-source-analysis"
    aria-label="目前來源的詞塊分析"
  >
    <div class="lyrics-source-analysis__heading">
      <strong>詞塊分析（實驗性）</strong>
      <span>目前來源：{{ sourceLabel }}</span>
    </div>
    <UiHint v-if="availability">{{ availability }}</UiHint>
    <UiHint v-if="experiment.needsReanalysis.value" role="status"
      >校時已變更，請重新分析；目前沿用來源時間。</UiHint
    >
    <UiHint
      v-else-if="
        !readyCount &&
        !['missing', 'disabled'].includes(experiment.estimate.value.status)
      "
      >目前沒有可套用的詞塊，沿用原有歌詞；可重新分析。</UiHint
    >
    <UiHint v-if="readyCount" role="status"
      >T1+ 模型估計 · {{ experiment.applied.value ? '使用中' : '未套用' }} ·
      {{ readyCount }} 句模型詞塊，其餘沿用來源 T2／整句時間。</UiHint
    >
    <UiHint v-if="jobDescription" role="status">{{ jobDescription }}</UiHint>
    <UiHint v-if="queue.error.value" tone="danger" role="alert">{{
      queue.error.value
    }}</UiHint>
    <div class="lyrics-source-analysis__actions">
      <UiSelect
        v-if="hasT1"
        :id="languageId"
        v-model="language"
        label="本次分析語言"
        :options="languageOptions"
        :disabled="blocked || busy"
      />
      <div class="lyrics-source-analysis__buttons">
        <UiButton
          v-if="busy"
          :disabled="saving"
          variant="secondary"
          @click="cancel"
          >取消分析</UiButton
        >
        <UiButton
          v-else-if="hasT1"
          :disabled="!canAnalyze"
          variant="secondary"
          @click="analyze"
          >{{ hasPrevious ? '重新分析' : '分析詞塊' }}</UiButton
        >
        <UiButton
          v-if="readyCount"
          :variant="experiment.applied.value ? 'secondary' : 'accent'"
          :disabled="
            blocked ||
            !queue.state.value?.enabled ||
            !queue.state.value?.allowed
          "
          :active="experiment.applied.value"
          :aria-pressed="experiment.applied.value"
          @click="experiment.setApplied(!experiment.applied.value)"
          >{{ experiment.applied.value ? '停用詞塊' : '套用詞塊' }}</UiButton
        >
      </div>
    </div>
    <UiHint v-if="hasT1"
      >依目前校時定位音訊；語言只影響本次分析。T1+
      尚未通過人工時間驗收，套用至歌詞與支援詞塊的 Output 模板，來源 T2
      優先。</UiHint
    >
  </section>
</template>

<style scoped>
.lyrics-source-analysis {
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
.lyrics-source-analysis__heading {
  display: grid;
  gap: var(--ui-space-1);
  overflow-wrap: anywhere;
  font-size: var(--ui-font-size-sm);
  color: var(--ui-color-text);
}
.lyrics-source-analysis__heading span {
  color: var(--ui-color-text-muted);
}
.lyrics-source-analysis__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.lyrics-source-analysis__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  margin-inline-start: auto;
}
</style>
