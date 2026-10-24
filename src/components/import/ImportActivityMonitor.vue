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
    artist: `${props.batch.kind === 'single' ? '單曲' : props.batch.collectionKind === 'album' ? releaseMetadataLabel(props.batch.releaseType, releaseYearFromDate(props.batch.releaseDate)) : '播放清單'} · ${progress.value.phaseLabel}`,
    thumbnailUrl: props.batch.thumbnailUrl,
  };
  return props.batch.kind === 'single'
    ? trackArtwork({ ...row, id: props.batch.tracks[0]?.id || row.id })
    : collectionArtwork(row, props.batch.source);
});
</script>

<template>
  <section
    v-if="visible"
    class="import-activity-monitor"
    :aria-label="`匯入工作：${batch.title}`"
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
        :action-label="`檢視匯入工作：${batch.title}`"
        @row-click="emit('review', batch.id)"
      >
        <template #trail>
          <UiIconButton
            v-if="running && batch.phase !== 'finalizing'"
            :icon="Square"
            :label="`停止匯入 ${batch.title}`"
            :disabled="batch.cancelRequested"
            @click.stop="emit('cancel', batch.id)"
            @dblclick.stop
          />
          <UiIconButton
            v-else-if="['failed', 'cancelled'].includes(batch.phase)"
            :icon="RefreshCw"
            :label="`重試匯入 ${batch.title}`"
            @click.stop="emit('retry', batch.id)"
            @dblclick.stop
          />
          <UiStatusIcon
            v-else-if="batch.phase === 'completed'"
            :icon="Check"
            tone="success"
            label="匯入完成"
          />
          <UiIconButton
            v-if="!running"
            :icon="X"
            :label="`清除匯入記錄 ${batch.title}`"
            @click.stop="emit('dismiss', batch.id)"
            @dblclick.stop
          />
        </template>
      </UiTrackRow>
    </ul>
    <UiProgress
      v-if="running && progress.total > 0"
      label="下載件數"
      :value="progress.processed"
      :max="progress.total"
      :value-text="`已處理 ${progress.processed}／${progress.total} 首`"
    />
    <UiHint v-if="running" role="status"
      >下載中 {{ progress.active }} · 等待 {{ progress.pending
      }}<template v-if="progress.failed">
        · 失敗 {{ progress.failed }}</template
      ></UiHint
    >
    <UiHint v-if="batch.cancelError" tone="warning" role="status"
      >停止下載未完成，工作仍在執行。請再試一次。</UiHint
    >
    <UiHint
      v-if="
        !running && (progress.failed || progress.cancelled || batch.saveError)
      "
      tone="warning"
      role="status"
    >
      完成 {{ progress.completed
      }}<template v-if="progress.failed"> · 失敗 {{ progress.failed }}</template
      ><template v-if="progress.cancelled">
        · 已停止 {{ progress.cancelled }}</template
      ><template v-if="batch.saveError"> · 清單尚未儲存</template>
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
