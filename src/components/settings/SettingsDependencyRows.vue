<script setup>
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import { t } from '../../utils/i18n.js';

// Tool rows; the default slot comes first and #after follows the items.
defineProps({
  items: { type: Array, default: () => [] },
});
const emit = defineEmits(['itemAction', 'itemAdvancedAction', 'noticeAction']);
</script>

<template>
  <div class="settings-dependency-rows">
    <slot />
    <SettingsDocumentItem
      v-for="item in items"
      :key="item.id"
      :title="item.title || item.name"
      :status="item.status"
      :status-tone="item.statusTone"
      :guidance="item.description"
      variant="nested"
    >
      <template #actions>
        <SettingsDependencyActions
          :item="item"
          @primary-action="emit('itemAction', $event)"
          @advanced-action="emit('itemAdvancedAction', $event)"
        />
      </template>
      <template v-if="item.notice" #feedback>
        <UiHint tone="danger" role="alert"
          >{{ item.notice.title }}：{{ item.notice.message }}</UiHint
        >
        <UiButton
          v-if="item.notice.operation !== 'remove'"
          variant="ghost"
          :disabled="item.actionDisabled"
          @click="emit('noticeAction', item.notice)"
          >{{ t('dependencies.actions.retry') }}</UiButton
        >
      </template>
    </SettingsDocumentItem>
    <slot name="after" />
  </div>
</template>

<style scoped>
.settings-dependency-rows > :deep(* + *) {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
</style>
