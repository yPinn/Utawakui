<script setup>
import { computed, onScopeDispose, shallowRef, useId, watch } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { useExperimentalLyricsQueue } from '../../composables/lyrics/useExperimentalLyricsQueue.js';
import { formatLyricsSourceLabel } from '../../utils/lyricsSourcePresentation.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiSelect from '../ui/UiSelect.vue';
import LyricsPhrasePreview from './LyricsPhrasePreview.vue';
import { summarizeAcousticPreview } from '../../../shared/presentation/lyricsAcousticPreview.mjs';
import { catalogKey, t } from '../../utils/i18n.js';

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
  { value: 'auto', label: t('lyricsResearch.languages.auto') },
  { value: 'zh', label: t('lyricsResearch.languages.zh') },
  { value: 'ja', label: t('lyricsResearch.languages.ja') },
  { value: 'en', label: t('lyricsResearch.languages.en') },
];
const sourceLabel = computed(() =>
  lyrics.selectedSource.value
    ? formatLyricsSourceLabel(lyrics.selectedSource.value)
    : t('lyricsResearch.analysis.noSource'),
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
const displayActionDescription = computed(() =>
  experiment.applied.value
    ? t('lyricsEditor.experiment.turnOff')
    : t('lyricsEditor.experiment.turnOn'),
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
  if (nativeOnly.value) return t('lyricsResearch.analysis.nativeOnly');
  if (!hasT1.value) return t('lyricsResearch.analysis.needsTimed');
  if (!queue.state.value) return t('lyricsResearch.analysis.checking');
  if (!queue.state.value.allowed)
    return t('lyricsResearch.analysis.needsProcessing');
  if (!queue.state.value.enabled)
    return t('lyricsResearch.analysis.needsExperiment');
  if (['missing', 'damaged'].includes(queue.state.value.environmentStatus))
    return t('lyricsResearch.analysis.needsTools');
  if (lyrics.state.offsetSave?.isSaving)
    return t('lyricsResearch.analysis.savingOffset');
  if (lyrics.state.offsetSave?.error)
    return t('lyricsResearch.analysis.offsetFailed');
  return '';
});
const jobDescription = computed(() => {
  if (busy.value) return '';
  if (currentItem.value?.status === 'failed')
    return t('lyricsResearch.analysis.failed');
  if (currentItem.value?.status === 'cancelled')
    return t('lyricsResearch.analysis.cancelled');
  if (currentItem.value?.status !== 'skipped') return '';
  const reason = currentItem.value.reason;
  return t(
    `lyricsResearch.analysis.skipped.${SKIP_REASONS.has(reason) ? catalogKey(reason) : 'other'}`,
  );
});
const SKIP_REASONS = new Set([
  'source-changed',
  'language-unknown',
  'language-unsupported',
  'lyrics-missing',
  'untimed-lyrics',
  'native-t2',
  'unsupported-lyrics',
  'environment-missing',
]);
const STAGE_KEYS = {
  verify: 'verify',
  load: 'load',
  alignment: 'alignment',
  hubertfa: 'alignment',
  content: 'content',
  small: 'small',
};
const stageLabel = (stage) =>
  Object.hasOwn(STAGE_KEYS, stage)
    ? t(`lyricsResearch.analysis.stage.${STAGE_KEYS[stage]}`)
    : undefined;
const progress = computed(() =>
  busy.value && item.value.status === 'running' ? item.value.progress : null,
);
const progressLabel = computed(() =>
  item.value?.status === 'pending'
    ? t('lyricsResearch.analysis.pending')
    : (stageLabel(progress.value?.stage ?? queue.state.value?.stage) ??
      t('lyricsResearch.analysis.preparing')),
);
const statusMessage = computed(() => {
  if (!busy.value && experiment.needsReanalysis.value)
    return t('lyricsResearch.analysis.reanalyze');
  if (jobDescription.value) return jobDescription.value;
  if (availability.value) return availability.value;
  if (busy.value) return '';
  if (readyCount.value) return statusSummary();
  if (!['missing', 'disabled'].includes(experiment.estimate.value.status))
    return t('lyricsResearch.analysis.noUsable');
  return '';
});
function statusSummary() {
  const fineLines = summary.value.fineLines;
  const missing = experiment.estimate.value.validation?.missingLyrics;
  return [
    t('lyricsResearch.analysis.summary', {
      state: experiment.applied.value
        ? t('lyricsResearch.analysis.applied')
        : t('lyricsResearch.analysis.notApplied'),
      lines: fineLines
        ? t(
            'lyricsEditor.experiment.fineLines',
            { count: fineLines },
            fineLines,
          )
        : t('lyricsEditor.experiment.hintsOnly'),
    }),
    experiment.estimate.value.compatibility?.rule ===
    'normalizer-v2-v3-exact-v1'
      ? t('lyricsResearch.analysis.reused')
      : '',
    missing
      ? t('lyricsResearch.analysis.missingLyrics', { count: missing }, missing)
      : '',
  ]
    .filter(Boolean)
    .join(t('common.sentenceJoin'));
}
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
    :aria-label="t('lyricsResearch.analysis.label')"
  >
    <div class="lyrics-source-analysis__heading">
      <strong>{{ t('lyricsResearch.settings.title') }}</strong>
      <span>{{
        t('lyricsResearch.analysis.currentSource', { source: sourceLabel })
      }}</span>
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
        progress
          ? t('lyricsResearch.analysis.progress', {
              done: progress.completed,
              total: progress.total,
            })
          : ''
      "
    />
    <div class="lyrics-source-analysis__actions">
      <UiSelect
        v-if="hasT1"
        :id="languageId"
        v-model="language"
        :label="t('lyricsResearch.analysis.mainLanguage')"
        :options="languageOptions"
        :disabled="blocked || busy"
      />
      <div class="lyrics-source-analysis__buttons">
        <UiButton
          v-if="busy"
          :disabled="saving"
          variant="secondary"
          @click="cancel"
          >{{ t('lyricsResearch.analysis.cancel') }}</UiButton
        >
        <UiButton
          v-else-if="hasT1"
          :disabled="!canAnalyze"
          variant="secondary"
          @click="analyze"
          >{{
            hasPrevious
              ? t('lyricsResearch.analysis.again')
              : t('lyricsResearch.analysis.analyze')
          }}</UiButton
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
          :title="displayActionDescription"
          :aria-description="displayActionDescription"
          @click="experiment.setApplied(!experiment.applied.value)"
          >{{ t('lyricsEditor.experiment.button') }}</UiButton
        >
      </div>
    </div>
    <UiHint v-if="hasT1">{{ t('lyricsResearch.analysis.afterHint') }}</UiHint>
    <UiDisclosure
      v-if="hasT1"
      v-model:open="detailsOpen"
      :label="t('lyricsResearch.analysis.detailsTitle')"
    >
      <UiHint>{{ t('lyricsResearch.analysis.details') }}</UiHint>
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
  font-size: var(--ui-type-label-size);
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
