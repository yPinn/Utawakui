<script setup>
import { ICON_SIZE } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';

defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  value: { type: String, default: '' },
  status: { type: String, default: '' },
  statusTone: { type: String, default: 'muted' },
  tooltip: { type: String, default: '' },
  scale: {
    type: String,
    default: 'normal',
    validator: (value) => ['compact', 'normal', 'prominent'].includes(value),
  },
});
</script>

<template>
  <div
    class="settings-action-row"
    :class="`settings-action-row--${scale}`"
    :title="tooltip || description || value || title"
  >
    <div v-if="icon" class="settings-action-row__icon" aria-hidden="true">
      <component :is="icon" :size="ICON_SIZE" />
    </div>

    <div class="settings-action-row__copy">
      <div class="settings-action-row__heading">
        <h3 class="settings-action-row__title">{{ title }}</h3>
        <UiChip v-if="status" :tone="statusTone">{{ status }}</UiChip>
      </div>
      <p v-if="description" class="settings-action-row__description">
        {{ description }}
      </p>
      <p v-if="value" class="settings-action-row__value" :title="value">
        {{ value }}
      </p>
    </div>

    <div v-if="$slots.actions" class="settings-action-row__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.settings-action-row {
  --settings-action-row-icon-size: var(--ui-settings-row-icon-size);
  --settings-action-row-padding-block: var(--ui-settings-row-padding-block);
  --settings-action-row-padding-inline: var(--ui-settings-row-padding-inline);
  --settings-action-row-title-size: var(--ui-font-size-sm);
  --settings-action-row-value-size: var(--ui-font-size-sm);

  min-width: 0;
  min-height: var(--ui-settings-row-min-height);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--settings-action-row-padding-block)
    var(--settings-action-row-padding-inline);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.settings-action-row--compact {
  --settings-action-row-title-size: var(--ui-font-size-sm);
  --settings-action-row-value-size: var(--ui-font-size-sm);
}

.settings-action-row--prominent {
  --settings-action-row-title-size: var(--ui-font-size-sm);
  --settings-action-row-value-size: var(--ui-font-size-sm);
}

.settings-action-row__icon {
  align-self: center;
  display: grid;
  place-items: center;
  width: var(--settings-action-row-icon-size);
  height: var(--settings-action-row-icon-size);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-accent-soft);
  color: var(--ui-color-accent);
}

.settings-action-row__copy {
  min-width: 0;
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

.settings-action-row__heading,
.settings-action-row__actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.settings-action-row__heading {
  min-width: 0;
  flex-wrap: wrap;
}

.settings-action-row__title,
.settings-action-row__description,
.settings-action-row__value {
  margin: 0;
}

.settings-action-row__title {
  color: var(--ui-color-text);
  font-size: var(--settings-action-row-title-size);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.settings-action-row__description,
.settings-action-row__value {
  color: var(--ui-color-text-muted);
  font-size: var(--settings-action-row-value-size);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.settings-action-row__value {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-action-row__actions {
  align-self: center;
  justify-content: flex-end;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .settings-action-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .settings-action-row__actions {
    grid-column: 2;
    justify-content: flex-start;
  }
}

@media (max-width: 680px) {
  .settings-action-row {
    grid-template-columns: 1fr;
  }

  .settings-action-row__icon {
    display: none;
  }

  .settings-action-row__actions {
    grid-column: auto;
  }
}
</style>
