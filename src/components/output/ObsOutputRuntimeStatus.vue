<script setup>
import { computed } from 'vue';
import {
  describeOutputClientStatus,
  describeOutputSourceStatus,
} from '../../utils/outputRuntimeStatus.js';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
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
  <section class="obs-output-runtime-status" aria-label="輸出狀態">
    <dl class="obs-output-runtime-status__signals">
      <div
        class="obs-output-runtime-status__signal"
        :title="sourceStatus.detail"
      >
        <dt>
          <span
            class="obs-output-runtime-status__dot"
            :data-tone="sourceStatus.tone"
            aria-hidden="true"
          />
          資料
        </dt>
        <dd>{{ sourceStatus.label }}</dd>
      </div>

      <div
        class="obs-output-runtime-status__signal"
        :title="clientStatus.detail"
        :aria-label="`Browser Source：${clientStatus.label}。${clientStatus.detail}`"
      >
        <dt>
          <span
            class="obs-output-runtime-status__dot"
            :data-tone="clientStatus.tone"
            aria-hidden="true"
          />
          來源
        </dt>
        <dd>{{ clientStatus.label }}</dd>
      </div>
    </dl>

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
.obs-output-runtime-status {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-block: 0 var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-output-runtime-status__signals {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-4);
  margin: 0;
}

.obs-output-runtime-status__signal,
.obs-output-runtime-status__signal dt {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.obs-output-runtime-status__signal {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.obs-output-runtime-status__signal dt,
.obs-output-runtime-status__signal dd {
  margin: 0;
}

.obs-output-runtime-status__signal dd {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-semibold);
  white-space: nowrap;
}

.obs-output-runtime-status__dot {
  inline-size: var(--ui-space-2);
  block-size: var(--ui-space-2);
  flex: 0 0 auto;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-text-muted);
}

.obs-output-runtime-status__dot[data-tone='info'] {
  background: var(--ui-color-info);
}

.obs-output-runtime-status__dot[data-tone='success'] {
  background: var(--ui-color-success);
}

.obs-output-runtime-status__dot[data-tone='warning'] {
  background: var(--ui-color-warning);
}

.obs-output-runtime-status__dot[data-tone='danger'] {
  background: var(--ui-color-danger);
}
</style>
