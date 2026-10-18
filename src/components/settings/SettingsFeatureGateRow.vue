<script setup>
import { computed, shallowRef, useSlots, watch } from 'vue';
import { Info, Loader2, Plus } from '../../icons/index.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import AppFeatureNoticeDocument from '../layout/AppFeatureNoticeDocument.vue';
import { getFeatureGate } from '../../constants/featureGates.js';

const props = defineProps({
  gate: { type: Object, required: true },
  items: { type: Array, default: () => [] },
  actionLabel: { type: String, required: true },
  disableEnableAction: { type: Boolean, default: false },
  highlighted: { type: Boolean, default: false },
});

const emit = defineEmits(['enable', 'itemAction', 'itemAdvancedAction']);
const slots = useSlots();

const hasItems = computed(() => props.items.length > 0);
const shouldShowItems = computed(
  () => props.gate.enabled && (hasItems.value || Boolean(slots.items)),
);
const isDependencySettingsOpen = shallowRef(false);
const dependencyAttentionCount = computed(
  () => props.items.filter((item) => item.statusTone !== 'success').length,
);
const dependencySummary = computed(() => {
  const status = dependencyAttentionCount.value
    ? `${dependencyAttentionCount.value} 項待處理`
    : '已就緒';
  return `工具與模型 · ${props.items.length} 項 · ${status}`;
});
watch(
  () => props.highlighted || dependencyAttentionCount.value > 0,
  (needsAttention) => {
    if (needsAttention) isDependencySettingsOpen.value = true;
  },
  { immediate: true },
);

// Available whether the gate is enabled or not — the declaration is what
// enabling it means, which is exactly what someone deciding whether to
// enable (or reconsidering an already-enabled gate) needs to re-read.
// AppFeatureNoticeModal.vue owns the enablement confirmation; this entry
// only opens the shared document for reading.
const isNoticeOpen = shallowRef(false);
const noticeFeature = computed(() => getFeatureGate(props.gate.id));
const hasNotice = computed(() => Boolean(noticeFeature.value));
const noticeLabel = computed(() => `${props.gate.title}的使用範圍說明`);
</script>

<template>
  <div
    class="settings-feature-gate-row"
    :class="{ 'settings-feature-gate-row--highlighted': highlighted }"
  >
    <SettingsDocumentItem
      :icon="gate.icon"
      :title="gate.title"
      :description="gate.description"
      :status="gate.status"
      :status-tone="gate.tone"
      variant="capability"
      title-tag="h4"
    >
      <template #actions>
        <UiIconButton
          v-if="hasNotice"
          :icon="Info"
          :active="isNoticeOpen"
          :aria-expanded="isNoticeOpen ? 'true' : 'false'"
          :label="noticeLabel"
          :title="noticeLabel"
          @click="isNoticeOpen = !isNoticeOpen"
        />
        <UiButton
          v-if="!gate.enabled"
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
    </SettingsDocumentItem>

    <UiModal
      v-if="hasNotice"
      :open="isNoticeOpen"
      :title="noticeFeature.documentTitle"
      size="wide"
      max-block-size="medium"
      presentation="document"
      @close="isNoticeOpen = false"
    >
      <AppFeatureNoticeDocument :feature="noticeFeature" />
    </UiModal>

    <div v-if="shouldShowItems" class="settings-feature-gate-row__items">
      <UiDisclosure
        v-if="hasItems"
        v-model:open="isDependencySettingsOpen"
        :label="dependencySummary"
      >
        <SettingsDocumentItem
          v-for="item in items"
          :key="item.id"
          :icon="item.icon"
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
        </SettingsDocumentItem>
      </UiDisclosure>
      <slot name="items" />
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
    background-color var(--ui-motion-duration-fast),
    box-shadow var(--ui-motion-duration-fast);
}

.settings-feature-gate-row--highlighted {
  background: var(--ui-color-warning-soft);
  box-shadow: 0 0 0 1px var(--ui-color-warning);
}

.settings-feature-gate-row__items {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  padding-block: var(--ui-space-1);
  padding-inline-start: var(--ui-space-2);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

@container app-folder-layout (max-width: 42.5rem) {
  .settings-feature-gate-row__items {
    padding-block: 0;
    padding-inline-start: 0;
    border-inline-start: none;
  }
}
</style>
