<script setup>
import { computed, shallowRef, watch } from 'vue';
import { useLibraryArtwork } from '../../composables/useLibraryArtwork.js';
import {
  releaseMetadataLabel,
  releaseYearFromDate,
} from '../../utils/releasePresentation.js';
import {
  Check,
  CircleX,
  ListMinus,
  RefreshCw,
  Square,
} from '../../icons/index.js';
import { useDeferredLoading } from '../../composables/useDeferredLoading.js';
import {
  importBatchProgress,
  isImportBatchRunning,
} from '../../utils/importBatch.js';
import UiTrackRow from '../ui/UiTrackRow.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiProgress from '../ui/UiProgress.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({ batch: { type: Object, required: true } });
const emit = defineEmits(['review', 'cancel', 'retry', 'dismiss']);
const running = computed(() => isImportBatchRunning(props.batch));
const needsAttention = computed(() =>
  ['failed', 'cancelled'].includes(props.batch.phase),
);
const menuAnchor = shallowRef(null);
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'retry',
      items: [
        {
          id: 'retry',
          kind: 'action',
          value: 'retry',
          label: t('import.monitor.retry'),
          icon: RefreshCw,
        },
      ],
    },
    {
      id: 'dismiss',
      items: [
        {
          id: 'dismiss',
          kind: 'action',
          value: 'dismiss',
          label: t('import.monitor.dismiss'),
          icon: ListMinus,
        },
      ],
    },
  ],
}));

function openMenuAtPointer(event) {
  if (!needsAttention.value) return;
  event.preventDefault();
  event.stopPropagation();
  menuAnchor.value = { kind: 'point', x: event.clientX, y: event.clientY };
}

function openMenuFromKeyboard(event) {
  if (!needsAttention.value) return;
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10'))
    return;
  event.preventDefault();
  event.stopPropagation();
  menuAnchor.value = { kind: 'element', element: event.currentTarget };
}

function selectMenuAction(action) {
  menuAnchor.value = null;
  if (!needsAttention.value) return;
  if (action === 'retry') emit('retry', props.batch.id);
  if (action === 'dismiss') emit('dismiss', props.batch.id);
}

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
        :state-surface-active="Boolean(menuAnchor)"
        hide-duration
        overflow="ellipsis"
        thumb-loading="lazy"
        thumb-decoding="async"
        :action-label="t('import.monitor.reviewNamed', { title: batch.title })"
        :action-keyboard-shortcuts="
          needsAttention ? 'ContextMenu Shift+F10' : undefined
        "
        @action-keydown="openMenuFromKeyboard"
        @contextmenu="openMenuAtPointer"
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
          <UiStatusIcon
            v-else-if="needsAttention"
            :icon="batch.phase === 'failed' ? CircleX : Square"
            :tone="batch.phase === 'failed' ? 'danger' : 'muted'"
            :label="progress.phaseLabel"
          />
          <UiStatusIcon
            v-else-if="batch.phase === 'completed'"
            :icon="Check"
            tone="success"
            :label="t('import.monitor.done')"
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
    <UiActionMenu
      v-if="needsAttention"
      :open="Boolean(menuAnchor)"
      :anchor="menuAnchor || undefined"
      size="sm"
      :aria-label="t('import.monitor.actions')"
      :content="menuContent"
      @select="selectMenuAction"
      @close="menuAnchor = null"
    />
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
