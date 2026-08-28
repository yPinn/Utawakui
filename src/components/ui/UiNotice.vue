<script setup>
import { computed } from 'vue';
import {
  Check,
  CircleAlert,
  CircleX,
  ICON_SIZE,
  RefreshCw,
} from '../../icons/index.js';
import { appErrorTone } from '../../utils/appErrors.js';
import UiButton from './UiButton.vue';

const props = defineProps({
  notice: { type: Object, default: null },
  tone: {
    type: String,
    default: '',
    validator: (value) =>
      ['', 'muted', 'info', 'success', 'warning', 'danger'].includes(value),
  },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['action']);

const resolvedTone = computed(() => {
  if (props.tone) return props.tone;
  return appErrorTone(props.notice);
});

const resolvedTitle = computed(() => props.title || props.notice?.title || '');
const resolvedMessage = computed(
  () => props.message || props.notice?.message || '',
);
const resolvedActionLabel = computed(
  () => props.actionLabel || props.notice?.actionLabel || '',
);

const icon = computed(() => {
  if (resolvedTone.value === 'success') return Check;
  if (resolvedTone.value === 'danger') return CircleX;
  if (resolvedTone.value === 'info') return RefreshCw;
  return CircleAlert;
});

const role = computed(() =>
  resolvedTone.value === 'danger' ? 'alert' : 'status',
);
</script>

<template>
  <div
    v-if="resolvedTitle || resolvedMessage"
    class="ui-notice"
    :class="[`ui-notice--${resolvedTone}`, { 'ui-notice--compact': compact }]"
    :role="role"
  >
    <component
      :is="icon"
      class="ui-notice__icon"
      :size="ICON_SIZE"
      aria-hidden="true"
    />
    <div class="ui-notice__body">
      <p v-if="resolvedTitle" class="ui-notice__title">
        {{ resolvedTitle }}
      </p>
      <p v-if="resolvedMessage" class="ui-notice__message">
        {{ resolvedMessage }}
      </p>
    </div>
    <UiButton
      v-if="resolvedActionLabel"
      class="ui-notice__action"
      @click="emit('action')"
    >
      {{ resolvedActionLabel }}
    </UiButton>
  </div>
</template>

<style scoped>
.ui-notice {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
}

.ui-notice--compact {
  padding: var(--ui-space-2);
}

.ui-notice--info {
  border-color: var(--ui-color-info);
  background: var(--ui-color-info-soft);
}

.ui-notice--success {
  border-color: var(--ui-color-success);
  background: var(--ui-color-success-soft);
}

.ui-notice--warning {
  border-color: var(--ui-color-warning);
  background: var(--ui-color-warning-soft);
}

.ui-notice--danger {
  border-color: var(--ui-color-danger);
  background: var(--ui-color-danger-soft);
}

.ui-notice__icon {
  margin-block-start: 0.125rem;
  color: var(--ui-color-text-muted);
}

.ui-notice--info .ui-notice__icon {
  color: var(--ui-color-info);
}

.ui-notice--success .ui-notice__icon {
  color: var(--ui-color-success);
}

.ui-notice--warning .ui-notice__icon {
  color: var(--ui-color-warning);
}

.ui-notice--danger .ui-notice__icon {
  color: var(--ui-color-danger);
}

.ui-notice__body {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.ui-notice__title,
.ui-notice__message {
  margin: 0;
}

.ui-notice__title {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.ui-notice__message {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.ui-notice__action {
  align-self: center;
}

@media (max-width: 35rem) {
  .ui-notice {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .ui-notice__action {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
