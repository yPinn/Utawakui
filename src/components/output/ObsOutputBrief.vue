<script setup>
import { computed } from 'vue';
import {
  describeOutputClientStatus,
  describeOutputSourceStatus,
} from '../../utils/outputRuntimeStatus.js';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
  preset: { type: Object, default: null },
  outputStatus: { type: Object, default: () => ({ running: false }) },
  error: { type: String, default: '' },
});

const sourceStatus = computed(() =>
  describeOutputSourceStatus(props.outputStatus),
);
const clientStatus = computed(() =>
  describeOutputClientStatus(props.outputStatus),
);
</script>

<template>
  <section class="obs-output-brief" aria-label="輸出摘要">
    <p class="obs-output-brief__summary">
      {{ preset?.summary ?? '選擇模板後可在這裡調整輸出外觀。' }}
    </p>

    <div class="obs-output-brief__signals">
      <div
        class="obs-output-brief__signal"
        role="group"
        :title="sourceStatus.detail"
        :aria-label="`資料：${sourceStatus.label}。${sourceStatus.detail}`"
      >
        <span
          class="obs-output-brief__dot"
          :data-tone="sourceStatus.tone"
          aria-hidden="true"
        />
        <span class="obs-output-brief__signal-name">資料</span>
        <strong class="obs-output-brief__signal-value">
          {{ sourceStatus.label }}
        </strong>
      </div>

      <div
        class="obs-output-brief__signal"
        role="group"
        :title="clientStatus.detail"
        :aria-label="`Browser Source：${clientStatus.label}。${clientStatus.detail}`"
      >
        <span
          class="obs-output-brief__dot"
          :data-tone="clientStatus.tone"
          aria-hidden="true"
        />
        <span class="obs-output-brief__signal-name">Browser Source</span>
        <strong class="obs-output-brief__signal-value">
          {{ clientStatus.label }}
        </strong>
      </div>
    </div>

    <UiNotice
      v-if="error"
      tone="danger"
      title="輸出未更新"
      :message="error"
      compact
    />
  </section>
</template>

<style scoped>
.obs-output-brief {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-2) var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-output-brief__summary {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.obs-output-brief__signals {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-4);
}

.obs-output-brief__signal {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-output-brief__dot {
  inline-size: var(--ui-space-2);
  block-size: var(--ui-space-2);
  flex: 0 0 auto;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-text-muted);
}

.obs-output-brief__dot[data-tone='info'] {
  background: var(--ui-color-info);
}

.obs-output-brief__dot[data-tone='success'] {
  background: var(--ui-color-success);
}

.obs-output-brief__dot[data-tone='warning'] {
  background: var(--ui-color-warning);
}

.obs-output-brief__dot[data-tone='danger'] {
  background: var(--ui-color-danger);
}

.obs-output-brief__signal-value {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
  white-space: nowrap;
}
</style>
