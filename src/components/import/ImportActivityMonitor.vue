<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useLibraryArtwork } from '../../composables/useLibraryArtwork.js';
import {
  releaseMetadataLabel,
  releaseYearFromDate,
} from '../../utils/releasePresentation.js';
import { Check, RefreshCw, Square, X } from '../../icons/index.js';
import { useDeferredLoading } from '../../composables/useDeferredLoading.js';
import {
  importBatchProgress,
  isImportBatchRunning,
} from '../../utils/importBatch.js';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({ batch: { type: Object, required: true } });
const emit = defineEmits(['review', 'cancel', 'retry', 'dismiss']);
const running = computed(() => isImportBatchRunning(props.batch));
const progress = computed(() => importBatchProgress(props.batch));
const { skeletonVisible } = useDeferredLoading(running, {
  identity: () => props.batch.id,
});
const revealed = shallowRef(false);
watch(
  [skeletonVisible, running],
  ([visible, busy]) => {
    if (visible || !busy) revealed.value = true;
  },
  { immediate: true },
);
const visible = computed(() => revealed.value || !running.value);
const { trackArtwork, collectionArtwork } = useLibraryArtwork();
const track = computed(() => {
  const row = {
    id: props.batch.id,
    title: props.batch.title,
    artist: t('import.monitor.meta', {
      kind:
        props.batch.kind === 'single'
          ? t('import.monitor.single')
          : props.batch.collectionKind === 'album'
            ? releaseMetadataLabel(
                props.batch.releaseType,
                releaseYearFromDate(props.batch.releaseDate),
              )
            : t('import.dock.playlist'),
      phase: progress.value.phaseLabel,
    }),
    thumbnailUrl: props.batch.thumbnailUrl,
  };
  return props.batch.kind === 'single'
    ? trackArtwork({ ...row, id: props.batch.tracks[0]?.id || row.id })
    : collectionArtwork(row, props.batch.source);
});
const runningSummary = computed(() =>
  [
    t('import.monitor.active', { count: progress.value.active }),
    t('import.monitor.pending', { count: progress.value.pending }),
    progress.value.failed &&
      t('import.monitor.failed', { count: progress.value.failed }),
  ]
    .filter(Boolean)
    .join(' · '),
);
const doneSummary = computed(() =>
  [
    t('import.monitor.completed', { count: progress.value.completed }),
    progress.value.failed &&
      t('import.monitor.failed', { count: progress.value.failed }),
    progress.value.cancelled &&
      t('import.monitor.cancelled', { count: progress.value.cancelled }),
    props.batch.saveError && t('import.monitor.notSaved'),
  ]
    .filter(Boolean)
    .join(' · '),
);
</script>

<template>
  <section
    v-if="visible"
    class="import-activity-monitor"
    :aria-label="t('import.monitor.jobNamed', { title: batch.title })"
  >
    <ul class="import-activity-monitor__rows">
      <UiTrackRow
        :track="track"
        interactive
        state-surface
        hide-duration
        overflow="ellipsis"
        thumb-loading="lazy"
        thumb-decoding="async"
        :action-label="t('import.monitor.reviewNamed', { title: batch.title })"
        @row-click="emit('review', batch.id)"
      >
        <template #trail>
          <UiIconButton
            v-if="running && batch.phase !== 'finalizing'"
            :icon="Square"
            :label="t('import.monitor.stopNamed', { title: batch.title })"
            :disabled="batch.cancelRequested"
            @click.stop="emit('cancel', batch.id)"
            @dblclick.stop
          />
          <UiIconButton
            v-else-if="['failed', 'cancelled'].includes(batch.phase)"
            :icon="RefreshCw"
            :label="t('import.monitor.retryNamed', { title: batch.title })"
            @click.stop="emit('retry', batch.id)"
            @dblclick.stop
          />
          <UiStatusIcon
            v-else-if="batch.phase === 'completed'"
            :icon="Check"
            tone="success"
            :label="t('import.monitor.done')"
          />
          <UiIconButton
            v-if="!running"
            :icon="X"
            :label="t('import.monitor.clearNamed', { title: batch.title })"
            @click.stop="emit('dismiss', batch.id)"
            @dblclick.stop
          />
        </template>
      </UiTrackRow>
    </ul>
    <UiProgress
      v-if="running && progress.total > 0"
      :label="t('import.monitor.progressLabel')"
      :value="progress.processed"
      :max="progress.total"
      :value-text="
        t('import.monitor.processed', {
          processed: progress.processed,
          total: progress.total,
        })
      "
    />
    <UiHint v-if="running" role="status">{{ runningSummary }}</UiHint>
    <UiHint v-if="batch.cancelError" tone="warning" role="status">{{
      t('import.monitor.cancelFailed')
    }}</UiHint>
    <UiHint
      v-if="
        !running && (progress.failed || progress.cancelled || batch.saveError)
      "
      tone="warning"
      role="status"
    >
      {{ doneSummary }}
    </UiHint>
  </section>
</template>

<style scoped>
.import-activity-monitor {
  -webkit-user-select: none;
  user-select: none;
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-right-dock-content-gap);
}
.import-activity-monitor__rows {
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
