<script setup>
import { computed } from 'vue';
import {
  Download,
  Play,
  RefreshCw,
  Square,
  Wrench,
} from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';

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
  capability: { type: Object, default: null },
  capabilityStageLabel: { type: String, default: '讀取分析功能狀態' },
  capabilityProgressPercent: { type: Number, default: null },
  capabilityBusy: { type: Boolean, default: false },
  capabilityError: { type: String, default: '' },
});

const emit = defineEmits(['analyze', 'cancel', 'reload', 'prepare', 'repair']);

const capabilityReady = computed(
  () =>
    props.capability?.status === 'ready' &&
    props.capability?.installed === true,
);

const displayStageLabel = computed(() =>
  capabilityReady.value ? props.stageLabel : props.capabilityStageLabel,
);

const displayProgressPercent = computed(() =>
  props.capabilityBusy
    ? props.capabilityProgressPercent
    : props.progressPercent,
);

const primaryAction = computed(() => {
  if (!props.capability) {
    return { label: '讀取分析功能', icon: Download, event: 'prepare' };
  }
  if (props.capability.status === 'unavailable') {
    return { label: '目前無法安裝', icon: Download, event: 'prepare' };
  }
  if (capabilityReady.value) {
    return { label: '開始分析', icon: Play, event: 'analyze' };
  }
  if (props.capability?.status === 'damaged') {
    return { label: '修復分析功能', icon: Wrench, event: 'repair' };
  }
  return { label: '下載並安裝', icon: Download, event: 'prepare' };
});

const primaryDisabled = computed(() => {
  if (props.capabilityBusy) return true;
  if (primaryAction.value.event === 'analyze') return !props.canAnalyze;
  if (primaryAction.value.event === 'repair') {
    return props.capability?.canRepair !== true;
  }
  return props.capability?.canPrepare !== true;
});

const statusTone = computed(() => {
  if (props.error || props.capabilityError) return 'danger';
  if (props.activeJob || props.busy || props.capabilityBusy) return 'info';
  if (!capabilityReady.value) return 'warning';
  return 'success';
});

const statusLabel = computed(() => {
  if (props.capabilityBusy) return '安裝中';
  if (props.activeJob || props.busy) return '分析中';
  if (!props.capability) return '讀取中';
  if (props.capability.status === 'unavailable') return '不可用';
  if (props.capability?.status === 'damaged') return '需修復';
  if (!capabilityReady.value) return '未安裝';
  return '待命';
});

const showRuntimeProgress = computed(
  () =>
    props.capabilityBusy ||
    props.busy ||
    props.activeJob !== null ||
    displayProgressPercent.value !== null,
);

function formatMegabytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return Math.ceil(bytes / 1024 / 1024);
}

function runPrimaryAction() {
  emit(primaryAction.value.event);
}
</script>

<template>
  <section class="analysis-job" aria-labelledby="analysis-job-heading">
    <div class="analysis-job__heading-row">
      <div>
        <h2 id="analysis-job-heading" class="analysis-job__heading">
          分析工作
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
        <UiChip :tone="statusTone">{{ statusLabel }}</UiChip>
      </div>
    </div>

    <UiNotice
      v-if="capabilityError || error"
      tone="danger"
      title="操作未完成"
      :message="capabilityError || error"
      compact
    />
    <UiHint v-else-if="notice" tone="info" role="status">
      {{ notice }}
    </UiHint>

    <UiHint
      v-if="
        !capabilityReady &&
        !capabilityBusy &&
        formatMegabytes(capability?.downloadBytes)
      "
      tone="muted"
    >
      將下載 {{ capability?.modelName }} 與固定 runtime，約
      {{ formatMegabytes(capability?.downloadBytes) }} MB。
    </UiHint>

    <div
      v-if="showRuntimeProgress"
      class="analysis-job__runtime"
      role="status"
      aria-live="polite"
    >
      <div class="analysis-job__runtime-copy">
        <span>{{ displayStageLabel }}</span>
        <span v-if="displayProgressPercent !== null"
          >{{ Math.round(displayProgressPercent) }}%</span
        >
      </div>
      <progress
        v-if="displayProgressPercent !== null"
        class="analysis-job__progress"
        max="100"
        :value="displayProgressPercent"
        :aria-label="capabilityBusy ? '分析功能安裝進度' : '音樂結構分析進度'"
      />
      <div v-else class="analysis-job__progress analysis-job__progress--idle" />
    </div>

    <div class="analysis-job__actions">
      <UiButton
        variant="accent"
        :icon="primaryAction.icon"
        :disabled="primaryDisabled"
        @click="runPrimaryAction"
      >
        {{ primaryAction.label }}
      </UiButton>
      <UiButton v-if="canCancel" :icon="Square" @click="emit('cancel')">
        取消
      </UiButton>
      <UiIconButton
        :icon="RefreshCw"
        label="重新讀取 sidecar"
        title="重新讀取 sidecar"
        size="sm"
        :disabled="!selectedTrack || busy"
        @click="emit('reload')"
      />
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
