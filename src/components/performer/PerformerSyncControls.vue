<script setup>
import { computed } from 'vue';
import UiNotice from '../ui/UiNotice.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiButtonGroup from '../ui/UiButtonGroup.vue';
import { Minus, Plus, RotateCcw } from '../../icons/index.js';

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
    <UiButtonGroup
      class="performer-sync-controls__actions"
      label="歌詞時間偏移"
    >
      <UiIconButton
        class="performer-sync-controls__button"
        :icon="Minus"
        label="延後 0.1 秒"
        variant="ghost"
        :disabled="controlsDisabled"
        @click="$emit('action', 'delay')"
      />
      <UiIconButton
        class="performer-sync-controls__button"
        :icon="RotateCcw"
        label="歸零"
        variant="ghost"
        :disabled="controlsDisabled"
        @click="$emit('action', 'reset')"
      />
      <UiIconButton
        class="performer-sync-controls__button"
        :icon="Plus"
        label="提前 0.1 秒"
        variant="ghost"
        :disabled="controlsDisabled"
        @click="$emit('action', 'advance')"
      />
    </UiButtonGroup>
    <UiNotice
      v-if="offset.available && offset.error"
      class="performer-sync-controls__error"
      :message="offset.error"
      tone="danger"
      action-label="重試"
      compact
      @action="$emit('action', 'retry')"
    />
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
.performer-sync-controls__actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.performer-sync-controls__status {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.performer-sync-controls__status output {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.performer-sync-controls__actions {
  flex-wrap: nowrap;
}

.performer-sync-controls__button {
  min-block-size: var(--ui-performer-action-min-block-size);
}

.performer-sync-controls__error {
  flex-basis: 100%;
}

.performer-sync-controls__error :deep(.ui-notice__action) {
  min-block-size: var(--ui-performer-action-min-block-size);
}
</style>
