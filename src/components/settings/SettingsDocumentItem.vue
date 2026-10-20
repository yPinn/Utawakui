<script setup>
import { computed, useId } from 'vue';
import { ICON_SIZE } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';

const props = defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  guidance: { type: String, default: '' },
  value: { type: String, default: '' },
  status: { type: String, default: '' },
  statusTone: { type: String, default: 'muted' },
  statusLive: { type: Boolean, default: false },
  variant: {
    type: String,
    default: 'default',
    validator: (value) => ['default', 'nested'].includes(value),
  },
  titleTag: {
    type: String,
    default: '',
    validator: (value) => ['', 'h3', 'h4', 'h5', 'span'].includes(value),
  },
});

const titleId = `settings-document-item-${useId()}`;
const resolvedTitleTag = computed(
  () => props.titleTag || (props.variant === 'nested' ? 'h4' : 'h3'),
);
const supportingCopy = computed(() =>
  [props.description, props.guidance].filter(Boolean).join(' '),
);
</script>

<template>
  <div
    class="settings-document-item"
    :class="`settings-document-item--${variant}`"
    :aria-labelledby="titleId"
  >
    <div class="settings-document-item__lead">
      <div
        v-if="icon && variant !== 'nested'"
        class="settings-document-item__icon"
        aria-hidden="true"
      >
        <component :is="icon" :size="ICON_SIZE" />
      </div>

      <div class="settings-document-item__copy">
        <component
          :is="resolvedTitleTag"
          :id="titleId"
          class="settings-document-item__title"
        >
          {{ title }}
        </component>
        <p
          v-if="supportingCopy"
          class="settings-document-item__supporting-copy"
        >
          {{ supportingCopy }}
        </p>
        <div
          v-if="status || value"
          class="settings-document-item__current-state"
        >
          <UiChip
            v-if="status"
            :tone="statusTone"
            :role="statusLive ? 'status' : undefined"
            >{{ status }}</UiChip
          >
          <UiOverflowTooltip
            v-if="value"
            as="p"
            class="settings-document-item__value"
            :text="value"
          >
            {{ value }}
          </UiOverflowTooltip>
        </div>
      </div>
    </div>
    <div v-if="$slots.actions" class="settings-document-item__actions">
      <slot name="actions" />
    </div>
    <div v-if="$slots.feedback" class="settings-document-item__feedback">
      <slot name="feedback" />
    </div>
  </div>
</template>

<style scoped>
.settings-document-item {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--ui-space-5);
  row-gap: var(--ui-space-2);
  padding-block: var(--settings-row-padding-block, var(--ui-space-4));
}

.settings-document-item--nested {
  padding-block: var(--settings-child-padding-block, var(--ui-space-3));
  padding-inline-start: var(
    --settings-copy-inset,
    calc(var(--ui-icon-button-size-md) + var(--ui-space-3))
  );
  gap: var(--ui-space-3);
}

.settings-document-item--nested .settings-document-item__lead {
  grid-template-columns: minmax(0, 1fr);
}

.settings-document-item__lead {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: var(--ui-icon-button-size-md) minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-3);
}
.settings-document-item__lead:only-child {
  grid-column: 1 / -1;
}

.settings-document-item__icon {
  display: grid;
  place-items: center;
  inline-size: var(--ui-icon-button-size-md);
  block-size: var(--ui-icon-button-size-md);
  color: var(--ui-color-accent);
}

.settings-document-item__copy,
.settings-document-item__current-state {
  min-inline-size: 0;
  display: grid;
}

.settings-document-item__copy {
  grid-column: 2;
  gap: var(--ui-space-1);
}
.settings-document-item--nested .settings-document-item__copy {
  grid-column: 1;
}

.settings-document-item__title,
.settings-document-item__supporting-copy {
  margin: 0;
}

.settings-document-item__title {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.settings-document-item__supporting-copy {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.settings-document-item__supporting-copy {
  max-inline-size: 70ch;
}

.settings-document-item__current-state {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}

.settings-document-item__current-state :deep(.settings-document-item__value) {
  margin: 0;
  max-inline-size: 100%;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-document-item__feedback {
  min-inline-size: 0;
  inline-size: 100%;
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
  padding-inline-start: var(--settings-copy-inset, 0);
  overflow-wrap: anywhere;
}
.settings-document-item--nested .settings-document-item__feedback {
  padding-inline-start: 0;
}
.settings-document-item__feedback :deep(button) {
  margin-inline-start: auto;
}

.settings-document-item__actions {
  min-inline-size: 0;
  inline-size: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

@container settings-section (max-width: 48rem) {
  .settings-document-item {
    column-gap: var(--ui-space-3);
  }
}

@container settings-section (max-width: 32rem) {
  .settings-document-item {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-document-item__lead {
    grid-template-columns: var(--ui-icon-button-size-md) minmax(0, 1fr);
  }
}

@container settings-section (max-width: 30rem) {
  .settings-document-item__icon {
    visibility: hidden;
  }
}
</style>
