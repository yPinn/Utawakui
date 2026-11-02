<script setup>
import { computed, watch } from 'vue';
import { Download, RotateCcw, Square } from '../../icons/index.js';
import { useReleaseCatalogBatchDownloads } from '../../composables/useReleaseCatalogBatchDownloads.js';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

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
  <div class="release-batch-actions" :aria-label="t('release.batch.label')">
    <UiIconButton
      v-if="!snapshot?.active"
      :icon="Download"
      :disabled="busy || !snapshot?.downloadableCount"
      :loading="busy && !snapshot"
      :loading-label="t('release.batch.checking')"
      :label="
        snapshot
          ? t('release.batch.downloadCount', {
              count: snapshot.downloadableCount,
            })
          : t('release.batch.download')
      "
      @click="batches.start(collection)"
    />
    <UiIconButton
      v-else
      :icon="Square"
      :label="t('release.batch.stop')"
      :disabled="busy || snapshot.phase === 'stopping'"
      @click="batches.stop(collection)"
    />
    <UiIconButton
      v-if="!snapshot?.active && failures"
      :icon="RotateCcw"
      :disabled="busy"
      :label="t('release.batch.retry', { count: failures })"
      @click="batches.retry(collection)"
    />
    <span
      v-if="snapshot?.total"
      class="release-batch-actions__status"
      role="status"
      aria-live="polite"
    >
      {{
        t(
          snapshot.phase === 'stopping'
            ? 'release.batch.stopping'
            : snapshot.active
              ? 'release.batch.downloading'
              : snapshot.phase === 'stopped'
                ? 'release.batch.stopped'
                : 'release.batch.done',
        )
      }}
      {{ snapshot.completed }} / {{ snapshot.total
      }}<template v-if="failures">
        · {{ t('release.batch.pending', { count: failures }) }}</template
      >
    </span>
    <UiIconButton
      v-if="error"
      :icon="RotateCcw"
      intent="danger"
      :disabled="busy"
      :label="t('release.batch.reloadWithError', { error })"
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
  font-size: var(--ui-type-caption-size);
  color: var(--ui-color-text-muted);
  -webkit-user-select: none;
  user-select: none;
}
</style>
