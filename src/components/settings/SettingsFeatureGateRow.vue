<script setup>
import { computed, shallowRef } from 'vue';
import { Info, Loader2, Plus } from '../../icons/index.js';
import SettingsActionRow from './SettingsActionRow.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';

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

// Available whether the gate is enabled or not — the declaration is what
// enabling it means, which is exactly what someone deciding whether to
// enable (or reconsidering an already-enabled gate) needs to re-read.
// AppFeatureNoticeModal.vue only ever shows this once, at the moment of
// enabling.
const isNoticeOpen = shallowRef(false);
const hasNotice = computed(() => props.gate.body?.length > 0);
const noticeLabel = computed(() => `${props.gate.title}的使用範圍說明`);
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
      :status="gate.status"
      :status-tone="gate.tone"
      variant="feature"
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
    </SettingsActionRow>

    <UiModal
      v-if="hasNotice"
      :open="isNoticeOpen"
      :title="gate.title"
      size="notice"
      @close="isNoticeOpen = false"
    >
      <div class="settings-feature-gate-row__notice">
        <p
          v-if="gate.description"
          class="settings-feature-gate-row__notice-summary"
        >
          {{ gate.description }}
        </p>
        <ul class="settings-feature-gate-row__notice-list">
          <li v-for="line in gate.body" :key="line">{{ line }}</li>
        </ul>
      </div>
    </UiModal>

    <div v-if="shouldShowItems" class="settings-feature-gate-row__items">
      <SettingsActionRow
        v-for="item in items"
        :key="item.id"
        :icon="item.icon"
        :title="item.title || item.name"
        :value="item.value"
        :status="item.status"
        :status-tone="item.statusTone"
        :tooltip="item.description"
        variant="subtle"
      >
        <template #actions>
          <SettingsDependencyActions
            :item="item"
            @primary-action="emit('itemAction', $event)"
            @advanced-action="emit('itemAdvancedAction', $event)"
          />
        </template>
      </SettingsActionRow>
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

/* Mirrors AppFeatureNoticeModal.vue's .feature-notice* treatment — same
   declaration text, same modal shell, just reachable after enabling too. */
.settings-feature-gate-row__notice {
  display: grid;
  gap: var(--ui-space-3);
  max-width: 65ch;
}

.settings-feature-gate-row__notice-summary {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
}

.settings-feature-gate-row__notice-list {
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding-left: var(--ui-space-4);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
}

.settings-feature-gate-row__notice-list li {
  padding-left: var(--ui-space-1);
}

.settings-feature-gate-row__items {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
  padding-block: var(--ui-space-1);
  padding-inline-start: var(--ui-space-2);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

@media (max-width: 680px) {
  .settings-feature-gate-row__items {
    padding-block: 0;
    padding-inline-start: 0;
    border-inline-start: none;
  }
}
</style>
