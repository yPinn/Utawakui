<script setup>
import { computed } from 'vue';
import { Loader2, Plus } from '../../icons/index.js';
import SettingsActionRow from './SettingsActionRow.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  gate: { type: Object, required: true },
  items: { type: Array, default: () => [] },
  actionLabel: { type: String, required: true },
  disableEnableAction: { type: Boolean, default: false },
  highlighted: { type: Boolean, default: false },
});

const emit = defineEmits(['enable', 'itemAction', 'itemAdvancedAction']);

const hasItems = computed(() => props.items.length > 0);
const shouldShowItems = computed(() => props.gate.enabled && hasItems.value);

function itemStatus(item) {
  if (item.status) return item.status;
  return item.kind === 'binary' ? '未準備' : '待開放';
}

function itemStatusTone(item) {
  if (item.statusTone) return item.statusTone;
  return item.kind === 'binary' ? 'warning' : 'gated';
}

function itemValue(item) {
  if (item.value) return item.value;
  const parts = [];
  if (item.version) parts.push(item.version);
  if (item.license) parts.push(item.license);
  return parts.join(' / ') || item.kind;
}

function itemTooltip(item) {
  return item.tooltip || `${item.title || item.name} ${item.version || ''}`;
}
</script>

<template>
  <div
    class="settings-feature-gate-row"
    :class="{ 'settings-feature-gate-row--highlighted': highlighted }"
  >
    <SettingsActionRow
      :icon="gate.icon"
      :title="gate.title"
      :description="gate.description"
      :value="gate.value"
      :status="gate.status"
      :status-tone="gate.tone"
      :tooltip="gate.description"
      scale="compact"
    >
      <template v-if="!gate.enabled" #actions>
        <UiButton
          :icon="gate.isBusy ? Loader2 : Plus"
          variant="accent"
          :disabled="disableEnableAction"
          :aria-label="`${actionLabel}${gate.title}`"
          :title="`${actionLabel}${gate.title}`"
          @click="emit('enable', gate.id)"
        >
          {{ actionLabel }}
        </UiButton>
      </template>
    </SettingsActionRow>

    <div v-if="shouldShowItems" class="settings-feature-gate-row__items">
      <div
        v-for="item in items"
        :key="item.id"
        class="settings-feature-gate-row__item"
        :title="itemTooltip(item)"
      >
        <div class="settings-feature-gate-row__item-copy">
          <div class="settings-feature-gate-row__item-heading">
            <span class="settings-feature-gate-row__item-title">
              {{ item.title || item.name }}
            </span>
            <UiChip :tone="itemStatusTone(item)">
              {{ itemStatus(item) }}
            </UiChip>
          </div>
          <p class="settings-feature-gate-row__item-value">
            {{ itemValue(item) }}
          </p>
        </div>

        <SettingsDependencyActions
          :item="item"
          @primary-action="emit('itemAction', $event)"
          @advanced-action="emit('itemAdvancedAction', $event)"
        />
      </div>

      <UiHint v-if="gate.itemsHint" tone="muted">
        {{ gate.itemsHint }}
      </UiHint>
    </div>
  </div>
</template>

<style scoped>
.settings-feature-gate-row {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  transition:
    background-color var(--ui-motion-fast),
    box-shadow var(--ui-motion-fast);
}

.settings-feature-gate-row--highlighted {
  background: var(--ui-color-warning-soft);
  box-shadow: 0 0 0 1px var(--ui-color-warning);
}

.settings-feature-gate-row__items {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  padding-inline-start: calc(
    var(--ui-settings-row-icon-size) + var(--ui-space-2)
  );
}

.settings-feature-gate-row__item {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.settings-feature-gate-row__item-copy {
  min-width: 0;
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

.settings-feature-gate-row__item-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.settings-feature-gate-row__item-title,
.settings-feature-gate-row__item-value {
  margin: 0;
}

.settings-feature-gate-row__item-title {
  min-width: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.settings-feature-gate-row__item-value {
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 680px) {
  .settings-feature-gate-row__items {
    padding-inline-start: 0;
  }

  .settings-feature-gate-row__item {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
