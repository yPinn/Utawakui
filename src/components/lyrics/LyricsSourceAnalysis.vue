<script setup>
import { computed, onScopeDispose, shallowRef, useId, watch } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { useExperimentalLyricsQueue } from '../../composables/lyrics/useExperimentalLyricsQueue.js';
import { formatLyricsSourceLabel } from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiSelect from '../ui/UiSelect.vue';
import LyricsPhrasePreview from './LyricsPhrasePreview.vue';
import { summarizeAcousticPreview } from '../../../shared/presentation/lyricsAcousticPreview.mjs';

const props = defineProps({
  active: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});
const lyrics = useLyrics();
const experiment = lyrics.experimentalLyrics;
const queue = useExperimentalLyricsQueue();
const language = shallowRef('auto'),
  saving = shallowRef(false),
  detailsOpen = shallowRef(false);
const languageId = `lyrics-source-analysis-${useId()}`;
const languageOptions = [
  { value: 'auto', label: '自動辨識' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日文' },
  { value: 'en', label: '英文' },
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
  queue.state.value?.items?.findLast(
    (entry) =>
      entry.trackId === lyrics.state.selectedTrackId &&
      entry.sourceFilename === lyrics.state.selectedSourceFilename &&
      entry.sourceRevision &&
      entry.sourceRevision === experiment.estimate.value.sourceRevision,
  ),
);
const busy = computed(() =>
  ['pending', 'running'].includes(item.value?.status),
);
const currentItem = item;
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
const summary = computed(() =>
  summarizeAcousticPreview(experiment.prepared.value),
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
  if (busy.value) return '';
  if (currentItem.value?.status === 'failed')
    return '分析失敗；原有歌詞與伴奏仍可使用，可重新分析。';
  if (currentItem.value?.status === 'cancelled')
    return '分析已取消；原有歌詞與伴奏仍可使用。';
  if (currentItem.value?.status !== 'skipped') return '';
  return (
    {
      'source-changed': '選用來源已變更，請確認目前來源後重新分析。',
      'language-unknown':
        '尚無可可靠分流的句子；可指定主要語言提示後重試，混語句仍沿用 T1。',
      'language-unsupported':
        '目前支援中文、日文與英文，請確認後指定分析語言。',
      'lyrics-missing': '沒有歌詞來源，請先加入時間歌詞。',
      'untimed-lyrics': '目前來源沒有可分析的整句時間。',
      'native-t2': '來源 T2 已提供逐字時間，直接沿用。',
      'unsupported-lyrics': '目前沒有可分析的單語句；句內混語沿用 T1。',
      'environment-missing': '請先至設定準備歌詞分析工具。',
    }[currentItem.value.reason] ?? '目前來源無法分析，請確認語言與整句時間。'
  );
});
const stageLabels = {
  verify: '檢查環境',
  load: '載入模型',
  alignment: '對齊詞塊',
  hubertfa: '對齊詞塊',
  content: '查核歌詞內容',
  small: '載入內容檢查',
};
const progress = computed(() =>
  busy.value && item.value.status === 'running' ? item.value.progress : null,
);
const progressLabel = computed(() =>
  item.value?.status === 'pending'
    ? '等待分析'
    : (stageLabels[progress.value?.stage ?? queue.state.value?.stage] ??
      '準備分析'),
);
const statusMessage = computed(() => {
  if (!busy.value && experiment.needsReanalysis.value)
    return '校時已變更，請重新分析；目前沿用來源時間。';
  if (jobDescription.value) return jobDescription.value;
  if (availability.value) return availability.value;
  if (busy.value) return '';
  if (readyCount.value)
    return (
      '分析' +
      (experiment.applied.value ? '已套用' : '未套用') +
      ' · ' +
      (summary.value.fineLines
        ? `${summary.value.fineLines} 句含掃字時間`
        : '僅分段提示') +
      '；未涵蓋部分沿用原歌詞。' +
      (experiment.estimate.value.validation?.missingLyrics
        ? ` 疑似漏詞 ${experiment.estimate.value.validation.missingLyrics} 句，套用前請確認。`
        : '')
    );
  if (!['missing', 'disabled'].includes(experiment.estimate.value.status))
    return '目前沒有可套用的詞塊，沿用來源時間；請重新分析。';
  return '';
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
  const job = item.value;
  if (!job?.jobId) return;
  saving.value = true;
  try {
    await queue.cancel(job.trackId, job.jobId);
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
    detailsOpen.value = false;
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
      <strong>歌詞時間分析（實驗）</strong>
      <span>目前來源：{{ sourceLabel }}</span>
    </div>
    <UiHint v-if="queue.error.value" tone="danger" role="alert">{{
      queue.error.value
    }}</UiHint>
    <UiHint v-else-if="statusMessage" role="status">{{ statusMessage }}</UiHint>
    <UiProgress
      v-if="busy"
      :label="progressLabel"
      :indeterminate="!progress"
      :value="progress?.completed ?? 0"
      :max="progress?.total ?? 1"
      :value-text="
        progress ? progress.completed + ' / ' + progress.total + ' 段音訊' : ''
      "
    />
    <div class="lyrics-source-analysis__actions">
      <UiSelect
        v-if="hasT1"
        :id="languageId"
        v-model="language"
        label="主要語言提示"
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
          >{{ hasPrevious ? '重新分析' : '分析歌詞' }}</UiButton
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
          >{{ experiment.applied.value ? '停用分析' : '套用分析' }}</UiButton
        >
      </div>
    </div>
    <UiHint v-if="hasT1">分析完成後可手動套用。</UiHint>
    <UiDisclosure v-if="hasT1" v-model:open="detailsOpen" label="分析說明">
      <UiHint
        >依目前校時逐句分流中／日／英，提示只作用本次；句內混語或證據不足沿用
        T1。變更來源或校時後需重新分析。來源 T2 優先，未通過的句子沿用
        T1。缺字可依分段時間估計填色；有細時間的文字沿用原區間。本地、Focus
        與卡拉 OK 支援掃字，外觀依畫面而定。分析時間仍需人工確認。</UiHint
      >
    </UiDisclosure>
    <LyricsPhrasePreview
      :document="
        experiment.outputDocument?.value ?? lyrics.lyricsDocument.value
      "
      :position-ms="lyrics.currentLyricsPositionMs?.value ?? null"
    />
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
