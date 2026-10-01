<script setup>
import { computed, shallowRef } from 'vue';
import { ListChecks, Square } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiProgress from '../ui/UiProgress.vue';

const props = defineProps({
  selectedCount: { type: Number, default: 0 },
  batch: { type: Object, default: null },
  active: { type: Boolean, default: false },
  capabilityReady: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' },
  summary: { type: String, default: '' },
});

const emit = defineEmits(['start', 'cancel']);
const force = shallowRef(false);

const startDisabled = computed(
  () =>
    props.disabled ||
    props.active ||
    !props.capabilityReady ||
    props.selectedCount === 0,
);
const statusLabel = computed(() => {
  if (props.batch?.status === 'cancelling') return '取消中';
  if (props.active) return '執行中';
  if (props.batch?.status === 'cancelled') return '已取消';
  if (props.batch?.status === 'completed') return '已完成';
  return '待命';
});
const statusTone = computed(() => {
  if (props.error || props.batch?.failed > 0) return 'danger';
  if (props.active) return 'info';
  if (props.batch?.status === 'completed') return 'success';
  if (props.batch?.status === 'cancelled') return 'warning';
  return 'muted';
});
const progressPercent = computed(() =>
  Number.isFinite(props.batch?.percent) ? props.batch.percent : null,
);

function startBatch() {
  if (!startDisabled.value) emit('start', { force: force.value });
}
</script>

<template>
  <section class="analysis-batch" aria-labelledby="analysis-batch-heading">
    <div class="analysis-batch__heading-row">
      <div>
        <h2 id="analysis-batch-heading" class="analysis-batch__heading">
          批次分析
        </h2>
        <p class="analysis-batch__selection">已選 {{ selectedCount }} 首</p>
      </div>
      <UiChip :tone="statusTone">{{ statusLabel }}</UiChip>
    </div>

    <UiNotice
      v-if="error"
      tone="danger"
      title="批次操作未完成"
      :message="error"
      compact
    />

    <template v-if="active">
      <UiProgress
        label="批次分析總進度"
        :value="progressPercent ?? 0"
        :value-text="
          progressPercent === null
            ? summary
            : `${summary} · ${Math.round(progressPercent)}%`
        "
        :indeterminate="progressPercent === null"
        role="status"
        aria-live="polite"
      />
      <UiButton :icon="Square" @click="emit('cancel')">取消批次</UiButton>
    </template>

    <template v-else>
      <UiCheckbox
        id="music-analysis-batch-force"
        v-model="force"
        label="重新分析已有結果"
        :disabled="disabled"
      />
      <UiHint tone="muted">
        預設略過已有 M1／M2 結果的曲目；失敗曲目不會中止其餘工作。
      </UiHint>
      <div class="analysis-batch__actions">
        <UiButton
          variant="accent"
          :icon="ListChecks"
          :disabled="startDisabled"
          @click="startBatch"
        >
          分析已選曲目
        </UiButton>
        <span
          v-if="batch && summary"
          class="analysis-batch__summary"
          role="status"
        >
          {{ summary }}
        </span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.analysis-batch {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.analysis-batch__heading-row,
.analysis-batch__actions,
.analysis-batch__force {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.analysis-batch__heading-row {
  justify-content: space-between;
}

.analysis-batch__heading,
.analysis-batch__selection {
  margin: 0;
}

.analysis-batch__heading {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.analysis-batch__selection,
.analysis-batch__summary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.analysis-batch__actions {
  flex-wrap: wrap;
}
</style>
