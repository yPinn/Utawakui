<script setup>
import { computed, shallowRef, useId } from 'vue';
import { ICON_SIZE, Info, Loader2, Plus } from '../../icons/index.js';
import SettingsDependencyList from './SettingsDependencyList.vue';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import AppFeatureNoticeDocument from '../layout/AppFeatureNoticeDocument.vue';
import { getFeatureGate } from '../../constants/featureGates.js';

const props = defineProps({
  gate: { type: Object, required: true },
  hasSettings: { type: Boolean, default: false },
  retainSettings: { type: Boolean, default: false },
  additionalToolCount: { type: Number, default: 0 },
  additionalToolBusy: { type: Boolean, default: false },
  additionalToolAttention: { type: Boolean, default: false },
  additionalToolLoaded: { type: Boolean, default: true },
  items: { type: Array, default: () => [] },
  actionLabel: { type: String, required: true },
  disableEnableAction: { type: Boolean, default: false },
  highlighted: { type: Boolean, default: false },
  requestNotice: { type: Object, default: null },
});

const emit = defineEmits([
  'enable',
  'itemAction',
  'itemAdvancedAction',
  'noticeAction',
  'requestAction',
]);
const titleId = `settings-feature-${useId()}`;
const showSettings = computed(
  () => props.hasSettings && (props.gate.enabled || props.retainSettings),
);
const showTools = computed(
  () =>
    props.gate.enabled &&
    (props.items.length > 0 || props.additionalToolCount > 0),
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
  <article
    :aria-labelledby="titleId"
    class="settings-feature-gate-row"
    :class="{ 'settings-feature-gate-row--highlighted': highlighted }"
  >
    <header class="settings-feature-gate-row__header">
      <div class="settings-feature-gate-row__identity">
        <component
          :is="gate.icon"
          v-if="gate.icon"
          class="settings-feature-gate-row__icon"
          :size="ICON_SIZE"
          aria-hidden="true"
        />
        <div>
          <h3 :id="titleId" class="settings-feature-gate-row__title">
            {{ gate.title }}
          </h3>
          <p
            v-if="gate.description"
            class="settings-feature-gate-row__description"
          >
            {{ gate.description }}
          </p>
        </div>
      </div>
      <div class="settings-feature-gate-row__actions">
        <UiChip v-if="gate.status" :tone="gate.tone">{{ gate.status }}</UiChip>

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
      </div>
    </header>

    <UiNotice
      v-if="requestNotice"
      tone="warning"
      :title="requestNotice.title"
      :message="requestNotice.message"
      :action-label="requestNotice.actionLabel"
      compact
      @action="emit('requestAction')"
    />
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

    <div
      v-if="showSettings || showTools"
      class="settings-feature-gate-row__body"
    >
      <div v-if="showSettings" class="settings-feature-gate-row__settings">
        <slot name="settings" />
      </div>
      <SettingsDependencyList
        v-if="showTools"
        :items="items"
        :additional-count="additionalToolCount"
        :additional-busy="additionalToolBusy"
        :additional-attention="additionalToolAttention"
        :additional-loaded="additionalToolLoaded"
        :highlighted="highlighted"
        @item-action="emit('itemAction', $event)"
        @item-advanced-action="emit('itemAdvancedAction', $event)"
        @notice-action="emit('noticeAction', $event)"
      >
        <slot name="tools" />
      </SettingsDependencyList>
    </div>
  </article>
</template>

<style scoped>
.settings-feature-gate-row {
  min-inline-size: 0;
  scroll-margin-block-start: var(--ui-space-4);
}
.settings-feature-gate-row:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
.settings-feature-gate-row--highlighted {
  outline: var(--ui-border-width) solid var(--ui-color-warning);
}
.settings-feature-gate-row__header {
  min-inline-size: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-block: var(--settings-row-padding-block, var(--ui-space-4));
}
.settings-feature-gate-row__identity {
  min-inline-size: 0;
  flex: 1 1 0;
  display: grid;
  grid-template-columns: var(--ui-icon-button-size-md) minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-3);
}
.settings-feature-gate-row__icon {
  justify-self: center;
  margin-block-start: var(--ui-space-1);
  color: var(--ui-color-accent);
}
.settings-feature-gate-row__title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-type-label-line-height);
}
.settings-feature-gate-row__description {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}
.settings-feature-gate-row__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
}
.settings-feature-gate-row__body {
  min-inline-size: 0;
}
.settings-feature-gate-row__settings > :deep(* + *) {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
@container settings-section (max-width: 30rem) {
  .settings-feature-gate-row__icon {
    visibility: hidden;
  }
  .settings-feature-gate-row__actions {
    margin-inline-start: auto;
  }
}
</style>
