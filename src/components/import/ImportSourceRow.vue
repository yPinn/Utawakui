<script setup>
import { computed } from 'vue';
import {
  ArrowDownToLine,
  Check,
  CircleX,
  Library,
  Loader2,
} from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  track: { type: Object, required: true },
  status: {
    type: String,
    default: 'pending',
    validator: (value) =>
      ['pending', 'downloading', 'done', 'downloaded', 'error'].includes(value),
  },
  actionIcon: { type: [Object, Function], default: null },
  actionLabel: { type: String, default: '' },
  actionDisabled: { type: Boolean, default: false },
  rowAction: { type: Boolean, default: false },
});

const emit = defineEmits(['action']);

const STATUS_PRESENTATION = Object.freeze({
  pending: Object.freeze({
    icon: ArrowDownToLine,
    tone: 'muted',
    label: '待下載',
  }),
  downloading: Object.freeze({
    icon: Loader2,
    tone: 'info',
    label: '下載中',
    spinning: true,
  }),
  done: Object.freeze({ icon: Check, tone: 'success', label: '完成' }),
  downloaded: Object.freeze({
    icon: Library,
    tone: 'muted',
    label: '已在曲庫',
  }),
  error: Object.freeze({ icon: CircleX, tone: 'danger', label: '下載失敗' }),
});

const statusPresentation = computed(
  () => STATUS_PRESENTATION[props.status] ?? STATUS_PRESENTATION.pending,
);
const hasAction = computed(() =>
  Boolean(props.actionIcon && props.actionLabel),
);
</script>

<template>
  <UiTrackRow
    class="import-source-row right-dock-track"
    :track="track"
    :interactive="rowAction && !actionDisabled"
    :action-label="rowAction ? actionLabel : undefined"
    state-surface
    hide-duration
    overflow="ellipsis"
    thumb-loading="lazy"
    thumb-decoding="async"
    @row-click="!actionDisabled && emit('action')"
  >
    <template #trail>
      <UiIconButton
        v-if="hasAction"
        :icon="actionIcon"
        :label="actionLabel"
        variant="ghost"
        size="md"
        :disabled="actionDisabled"
        @click="emit('action')"
      />
      <UiStatusIcon
        v-else
        :icon="statusPresentation.icon"
        :tone="statusPresentation.tone"
        :label="statusPresentation.label"
        :spinning="Boolean(statusPresentation.spinning)"
      />
    </template>
  </UiTrackRow>
</template>

<style scoped>
.import-source-row {
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
}
</style>
