<script setup>
import { computed } from 'vue';
import { Loader2, Play, RefreshCw, Square } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';

const props = defineProps({
  selectedTrack: { type: Object, default: null },
  activeJob: { type: Object, default: null },
  error: { type: String, default: '' },
  notice: { type: String, default: '' },
  phaseLabel: { type: String, required: true },
  stageLabel: { type: String, required: true },
  progressPercent: { type: Number, default: null },
  busy: { type: Boolean, default: false },
  canAnalyze: { type: Boolean, default: false },
  canCancel: { type: Boolean, default: false },
});

const emit = defineEmits(['analyze', 'cancel', 'reload']);

const statusTone = computed(() => {
  if (props.error) return 'danger';
  if (props.activeJob || props.busy) return 'info';
  return 'success';
});
</script>

<template>
  <section class="analysis-job" aria-labelledby="analysis-job-heading">
    <div class="analysis-job__heading-row">
      <div>
        <h2 id="analysis-job-heading" class="analysis-job__heading">
          Analysis job
        </h2>
        <p class="analysis-job__selection">
          <template v-if="selectedTrack">
            {{ selectedTrack.title }}
            <span v-if="selectedTrack.artist">
              · {{ selectedTrack.artist }}</span
            >
          </template>
          <template v-else>尚未選擇曲目</template>
        </p>
      </div>
      <div class="analysis-job__status">
        <UiStatusIcon
          :icon="Loader2"
          :tone="statusTone"
          :spinning="busy"
          :label="stageLabel"
        />
        <UiChip :tone="statusTone">{{ phaseLabel }}</UiChip>
      </div>
    </div>

    <UiNotice
      tone="info"
      title="Internal workbench"
      message="此頁只操作已存在的 analysis-structure activation，不會下載、安裝或核准 benchmark-only 模型。"
      compact
    />
    <UiNotice
      v-if="error"
      tone="danger"
      title="分析未完成"
      :message="error"
      compact
    />
    <UiNotice
      v-else-if="notice"
      tone="info"
      title="狀態已更新"
      :message="notice"
      compact
    />

    <div class="analysis-job__runtime" role="status" aria-live="polite">
      <div class="analysis-job__runtime-copy">
        <span>{{ stageLabel }}</span>
        <span v-if="progressPercent !== null"
          >{{ Math.round(progressPercent) }}%</span
        >
      </div>
      <progress
        v-if="progressPercent !== null"
        class="analysis-job__progress"
        max="100"
        :value="progressPercent"
        aria-label="Music Analysis 進度"
      />
      <div v-else class="analysis-job__progress analysis-job__progress--idle" />
      <p v-if="activeJob" class="analysis-job__job-id">
        Job {{ activeJob.jobId || 'pending' }}
      </p>
    </div>

    <div class="analysis-job__actions">
      <UiButton
        variant="accent"
        :icon="Play"
        :disabled="!canAnalyze"
        @click="emit('analyze')"
      >
        開始分析
      </UiButton>
      <UiButton v-if="canCancel" :icon="Square" @click="emit('cancel')">
        取消
      </UiButton>
      <UiButton
        :icon="RefreshCw"
        :disabled="!selectedTrack || busy"
        @click="emit('reload')"
      >
        重新讀取 sidecar
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.analysis-job {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.analysis-job__heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-4);
}

.analysis-job__heading,
.analysis-job__selection,
.analysis-job__job-id {
  margin: 0;
}

.analysis-job__heading {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.analysis-job__selection,
.analysis-job__job-id {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.analysis-job__status,
.analysis-job__actions,
.analysis-job__runtime-copy {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.analysis-job__runtime {
  display: grid;
  gap: var(--ui-space-1);
}

.analysis-job__runtime-copy {
  justify-content: space-between;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
}

.analysis-job__progress {
  width: 100%;
  height: var(--ui-space-2);
  border: 0;
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
  accent-color: var(--ui-color-accent);
}

.analysis-job__progress--idle {
  background: var(--ui-color-surface-hover);
}

.analysis-job__actions {
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .analysis-job__heading-row {
    flex-direction: column;
  }
}
</style>
