<script setup>
import { computed } from 'vue';
import {
  Check,
  CircleAlert,
  CircleX,
  ICON_SIZE,
  Info,
} from '../../icons/index.js';
import { appErrorTone } from '../../utils/appErrors.js';
import UiButton from './UiButton.vue';
import { injectNoticeReporter } from './noticeReporter.js';

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
  actionDisabled: { type: Boolean, default: false },
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

const reporter = injectNoticeReporter();
const reportable = computed(() =>
  Boolean(reporter && props.notice && reporter.canReport(props.notice)),
);

const icon = computed(() => {
  if (resolvedTone.value === 'success') return Check;
  if (resolvedTone.value === 'danger') return CircleX;
  if (resolvedTone.value === 'info') return Info;
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
    :class="[
      `ui-notice--${resolvedTone}`,
      {
        'ui-notice--compact': compact,
        'ui-notice--inline-action':
          resolvedActionLabel && !$slots.actions && !reportable,
      },
    ]"
    :role="role"
  >
    <div class="ui-notice__content">
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
        <slot name="details" />
      </div>
      <div v-if="$slots.actions || reportable" class="ui-notice__actions">
        <slot name="actions" />
        <UiButton
          v-if="!$slots.actions && resolvedActionLabel"
          variant="secondary"
          :disabled="actionDisabled"
          @click="!actionDisabled && emit('action')"
        >
          {{ resolvedActionLabel }}
        </UiButton>
        <UiButton
          v-if="reportable"
          variant="ghost"
          @click="reporter.report(notice)"
        >
          {{ reporter.label }}
        </UiButton>
      </div>
      <UiButton
        v-else-if="resolvedActionLabel"
        class="ui-notice__action"
        variant="secondary"
        :disabled="actionDisabled"
        @click="!actionDisabled && emit('action')"
      >
        {{ resolvedActionLabel }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.ui-notice {
  min-width: 0;
  container: ui-notice / inline-size;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text);
  overflow-wrap: anywhere;
}

.ui-notice__content {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-2);
}

.ui-notice--inline-action .ui-notice__content {
  grid-template-columns: auto minmax(0, 1fr) fit-content(40%);
}

.ui-notice__actions {
  grid-column: 2;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-2);
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
  margin-block-start: calc(var(--ui-space-1) / 2);
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
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.ui-notice--compact .ui-notice__title {
  font-size: var(--ui-type-label-size);
  line-height: var(--ui-type-label-line-height);
}

.ui-notice__message {
  color: var(--ui-color-text);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.ui-notice__action {
  min-width: 0;
  max-width: 100%;
  align-self: center;
}

@container ui-notice (max-width: 26rem) {
  .ui-notice--inline-action .ui-notice__content {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .ui-notice__action {
    grid-column: 2;
    justify-self: end;
  }
}
</style>
