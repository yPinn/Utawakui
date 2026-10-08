<script setup>
import { computed } from 'vue';
import UiButton from '../ui/UiButton.vue';

const props = defineProps({
  offset: {
    type: Object,
    default: () => ({
      milliseconds: 0,
      available: false,
      saving: false,
      error: '',
    }),
  },
});

defineEmits(['action']);

const controlsDisabled = computed(
  () => !props.offset.available || props.offset.saving,
);

const offsetLabel = computed(() => {
  const seconds = Number.isFinite(props.offset.milliseconds)
    ? props.offset.milliseconds / 1000
    : 0;
  const sign = seconds > 0 ? '+' : '';
  return `${sign}${seconds.toFixed(1)} 秒`;
});
</script>

<template>
  <section class="performer-sync-controls" aria-label="歌詞同步微調">
    <div class="performer-sync-controls__status">
      <span>同步</span>
      <output
        v-if="offset.available"
        :aria-label="`目前歌詞同步 ${offsetLabel}`"
        >{{ offsetLabel }}</output
      >
      <span v-else role="status">無同步歌詞</span>
      <span v-if="offset.saving" role="status">儲存中</span>
    </div>
    <div class="performer-sync-controls__actions">
      <UiButton
        variant="ghost"
        :disabled="controlsDisabled"
        @click="$emit('action', 'delay')"
      >
        延後 0.1 秒
      </UiButton>
      <UiButton
        variant="ghost"
        :disabled="controlsDisabled"
        @click="$emit('action', 'reset')"
      >
        歸零
      </UiButton>
      <UiButton
        variant="ghost"
        :disabled="controlsDisabled"
        @click="$emit('action', 'advance')"
      >
        提前 0.1 秒
      </UiButton>
    </div>
    <div
      v-if="offset.available && offset.error"
      class="performer-sync-controls__error"
      role="alert"
    >
      <span>{{ offset.error }}</span>
      <UiButton variant="ghost" @click="$emit('action', 'retry')">
        重試
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.performer-sync-controls {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2) var(--ui-space-3);
  flex-wrap: wrap;
}

.performer-sync-controls__status,
.performer-sync-controls__actions,
.performer-sync-controls__error {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.performer-sync-controls__status {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.performer-sync-controls__status output {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.performer-sync-controls__actions {
  flex-wrap: nowrap;
}

.performer-sync-controls__actions :deep(.ui-btn),
.performer-sync-controls__error :deep(.ui-btn) {
  min-block-size: var(--ui-performer-action-min-block-size);
}

.performer-sync-controls__error {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.performer-sync-controls__error {
  flex-basis: 100%;
  color: var(--ui-color-danger);
}
</style>
