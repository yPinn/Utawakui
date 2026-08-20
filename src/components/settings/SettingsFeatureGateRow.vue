<script setup>
import { computed } from 'vue';
import { Check, ICON_SIZE, Loader2, Settings } from '../../icons/index.js';
import SettingsActionRow from './SettingsActionRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';

const props = defineProps({
  gate: { type: Object, required: true },
  items: { type: Array, default: () => [] },
  actionLabel: { type: String, required: true },
  disableEnableAction: { type: Boolean, default: false },
  itemGroupLabel: { type: String, default: '準備項目' },
});

const emit = defineEmits(['enable', 'itemAction']);

const hasItems = computed(() => props.items.length > 0);
const shouldShowItems = computed(() => props.gate.enabled && hasItems.value);

function itemStatus(item) {
  if (item.status) return item.status;
  return item.kind === 'binary' ? '尚未準備' : '稍後提供';
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
  <div class="settings-feature-gate-row">
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
      <template #actions>
        <UiButton
          :icon="gate.enabled ? Check : gate.isBusy ? Loader2 : Check"
          :disabled="disableEnableAction"
          :aria-label="`${actionLabel}${gate.title}`"
          :title="`${actionLabel}${gate.title}`"
          @click="emit('enable', gate.id)"
        />
      </template>
    </SettingsActionRow>

    <div v-if="shouldShowItems" class="settings-feature-gate-row__items">
      <div class="settings-feature-gate-row__item-label">
        <Settings :size="ICON_SIZE" aria-hidden="true" />
        <span>{{ itemGroupLabel }}</span>
      </div>

      <SettingsActionRow
        v-for="item in items"
        :key="item.id"
        :icon="item.icon"
        :title="item.title || item.name"
        :description="item.description"
        :value="itemValue(item)"
        :status="itemStatus(item)"
        :status-tone="itemStatusTone(item)"
        :tooltip="itemTooltip(item)"
        scale="compact"
      >
        <template #actions>
          <UiButton
            v-if="item.actionIcon"
            :icon="item.actionIcon"
            :disabled="item.actionDisabled"
            :aria-disabled="item.actionDisabled ? 'true' : undefined"
            :aria-label="item.actionLabel"
            :title="item.actionLabel"
            @click="emit('itemAction', item.id)"
          />
        </template>
      </SettingsActionRow>

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
}

.settings-feature-gate-row__items {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-inline-start: calc(
    var(--ui-settings-row-icon-size) + var(--ui-space-2)
  );
}

.settings-feature-gate-row__item-label {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-xs);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-caption);
}

@media (max-width: 680px) {
  .settings-feature-gate-row__items {
    padding-inline-start: 0;
  }
}
</style>
