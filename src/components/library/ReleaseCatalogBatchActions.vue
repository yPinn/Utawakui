<script setup>
import { computed, watch } from 'vue';
import { Download, RotateCcw, Square } from '../../icons/index.js';
import { useReleaseCatalogBatchDownloads } from '../../composables/useReleaseCatalogBatchDownloads.js';
import UiIconButton from '../ui/UiIconButton.vue';

const props = defineProps({ collection: { type: Object, required: true } });
const batches = useReleaseCatalogBatchDownloads();
const snapshot = computed(() => batches.snapshotFor(props.collection));
const busy = computed(() => batches.busyFor(props.collection));
const error = computed(() => batches.errorFor(props.collection));
const failures = computed(
  () => (snapshot.value?.failed ?? 0) + (snapshot.value?.unlinked ?? 0),
);
watch(
  () => [
    props.collection.id,
    props.collection.releaseLibraryEpoch,
    props.collection.resolvedRelease?.revision,
  ],
  () => {
    void batches.inspect(props.collection);
  },
  { immediate: true },
);
</script>

<template>
  <div class="release-batch-actions" aria-label="專輯批次下載">
    <UiIconButton
      v-if="!snapshot?.active"
      :icon="Download"
      :disabled="busy || !snapshot?.downloadableCount"
      :loading="busy && !snapshot"
      loading-label="正在確認未下載曲目"
      :label="`下載未下載曲目${snapshot ? `（${snapshot.downloadableCount}）` : ''}`"
      @click="batches.start(collection)"
    />
    <UiIconButton
      v-else
      :icon="Square"
      label="停止尚未開始的專輯下載"
      :disabled="busy || snapshot.phase === 'stopping'"
      @click="batches.stop(collection)"
    />
    <UiIconButton
      v-if="!snapshot?.active && failures"
      :icon="RotateCcw"
      :disabled="busy"
      :label="`重試失敗項目（${failures}）`"
      @click="batches.retry(collection)"
    />
    <span
      v-if="snapshot?.total"
      class="release-batch-actions__status"
      role="status"
      aria-live="polite"
    >
      {{
        snapshot.phase === 'stopping'
          ? '停止排隊中'
          : snapshot.active
            ? '下載中'
            : snapshot.phase === 'stopped'
              ? '已停止排隊'
              : '已完成'
      }}
      {{ snapshot.completed }} / {{ snapshot.total
      }}<template v-if="failures"> · {{ failures }} 首待處理</template>
    </span>
    <UiIconButton
      v-if="error"
      :icon="RotateCcw"
      intent="danger"
      :disabled="busy"
      :label="`${error} 重新讀取專輯下載狀態`"
      @click="batches.inspect(collection)"
    />
    <span v-if="error" class="ui-visually-hidden" role="alert">{{
      error
    }}</span>
  </div>
</template>

<style scoped>
.release-batch-actions {
  display: contents;
}
.release-batch-actions__status {
  font-size: var(--ui-font-size-sm);
  color: var(--ui-color-text-muted);
}
</style>
