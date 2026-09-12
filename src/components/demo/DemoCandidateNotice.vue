<script setup>
import { computed, useAttrs } from 'vue';
import { Check, CircleAlert, CircleX, Info } from '../../icons/index.js';
import DemoCandidateButton from './DemoCandidateButton.vue';
import DemoCandidateStatusIcon from './DemoCandidateStatusIcon.vue';

defineOptions({ inheritAttrs: false });

const props = defineProps({
  tone: {
    type: String,
    default: 'neutral',
    validator: (value) =>
      ['neutral', 'info', 'success', 'warning', 'danger'].includes(value),
  },
  density: {
    type: String,
    default: 'standard',
    validator: (value) => ['standard', 'compact'].includes(value),
  },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
});

const emit = defineEmits(['action']);
const attrs = useAttrs();

const icon = computed(() => {
  if (props.tone === 'success') return Check;
  if (props.tone === 'warning') return CircleAlert;
  if (props.tone === 'danger') return CircleX;
  return Info;
});

const iconTone = computed(() =>
  props.tone === 'neutral' ? 'muted' : props.tone,
);
</script>

<template>
  <div
    v-if="title || message"
    v-bind="attrs"
    class="demo-candidate-notice"
    :class="[
      `demo-candidate-notice--${tone}`,
      `demo-candidate-notice--${density}`,
    ]"
  >
    <DemoCandidateStatusIcon
      class="demo-candidate-notice__icon"
      :icon="icon"
      :tone="iconTone"
      size="compact"
      label="通知狀態"
      decorative
    />
    <div class="demo-candidate-notice__body">
      <p v-if="title" class="demo-candidate-notice__title">{{ title }}</p>
      <p v-if="message" class="demo-candidate-notice__message">
        {{ message }}
      </p>
    </div>
    <DemoCandidateButton
      v-if="actionLabel"
      class="demo-candidate-notice__action"
      variant="secondary"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </DemoCandidateButton>
  </div>
</template>

<style scoped>
.demo-candidate-notice {
  --demo-notice-action-height: 2.25rem;
  --demo-button-height: var(--demo-notice-action-height);
  --demo-notice-status-icon-size: 1.25rem;

  box-sizing: border-box;
  min-inline-size: 0;
  max-inline-size: 100%;
  display: grid;
  grid-template-columns:
    var(--demo-notice-status-icon-size) minmax(0, 1fr)
    auto;
  align-items: start;
  column-gap: var(--ui-space-2);
  row-gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid
    color-mix(in srgb, var(--demo-notice-tone) 52%, var(--ui-color-border));
  border-radius: var(--ui-radius-lg);
  background: var(--demo-notice-surface);
  color: var(--ui-color-text);
}

.demo-candidate-notice--compact {
  --demo-notice-action-height: 2rem;

  padding: var(--ui-space-2);
}

.demo-candidate-notice--neutral {
  --demo-notice-tone: var(--ui-color-neutral);
  --demo-notice-surface: var(--ui-color-neutral-soft);
}

.demo-candidate-notice--info {
  --demo-notice-tone: var(--ui-color-info);
  --demo-notice-surface: var(--ui-color-info-soft);
}

.demo-candidate-notice--success {
  --demo-notice-tone: var(--ui-color-success);
  --demo-notice-surface: var(--ui-color-success-soft);
}

.demo-candidate-notice--warning {
  --demo-notice-tone: var(--ui-color-warning);
  --demo-notice-surface: var(--ui-color-warning-soft);
}

.demo-candidate-notice--danger {
  --demo-notice-tone: var(--ui-color-danger);
  --demo-notice-surface: var(--ui-color-danger-soft);
}

.demo-candidate-notice__icon {
  align-self: start;
}

.demo-candidate-notice__body {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.demo-candidate-notice__title,
.demo-candidate-notice__message {
  min-width: 0;
  margin: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}

.demo-candidate-notice__title {
  min-block-size: var(--demo-notice-status-icon-size);
  display: grid;
  align-items: center;
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-candidate-notice__message {
  color: color-mix(in srgb, var(--ui-color-text) 82%, var(--demo-notice-tone));
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.demo-candidate-notice__message:only-child {
  min-block-size: var(--demo-notice-status-icon-size);
  display: grid;
  align-items: center;
}

.demo-candidate-notice__action {
  max-width: 100%;
  align-self: center;
}

@container (max-width: 26rem) {
  .demo-candidate-notice {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .demo-candidate-notice__action {
    grid-column: 2;
    justify-self: end;
  }
}
</style>
