<script setup>
import { computed, useId } from 'vue';
import { RotateCcw } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  title: { type: String, default: '' },
  modified: { type: Boolean, default: false },
  headerActions: { type: Boolean, default: false },
});

const emit = defineEmits(['reset']);
const headerActionsId = `obs-property-actions-${useId()}`;

const resetLabel = computed(() =>
  t('outputPanel.field.resetNamed', { title: props.title }),
);
</script>

<template>
  <component :is="title ? 'section' : 'div'" class="obs-property-section">
    <header v-if="title" class="obs-property-section__header">
      <h3 class="obs-property-section__title">{{ title }}</h3>
      <div
        v-if="headerActions || modified"
        class="obs-property-section__actions"
      >
        <div
          v-if="headerActions"
          :id="headerActionsId"
          class="obs-property-section__action-slot"
        ></div>
        <UiIconButton
          v-if="modified"
          :icon="RotateCcw"
          :label="resetLabel"
          variant="ghost"
          @click="emit('reset')"
        />
      </div>
    </header>
    <slot name="description" />
    <div class="obs-property-section__fields">
      <slot
        :header-actions-target="
          title && headerActions ? `#${headerActionsId}` : undefined
        "
      />
    </div>
  </component>
</template>

<style scoped>
.obs-property-section {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-block: var(--obs-property-section-inset, var(--ui-space-3));
}

.obs-property-section + .obs-property-section {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.obs-property-section__header {
  min-inline-size: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  --obs-property-section-label-block-size: calc(
    var(--ui-type-label-size) * var(--ui-type-label-line-height)
  );
  font-size: var(--ui-type-label-size);
  line-height: var(--ui-type-label-line-height);
}

.obs-property-section__title {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ui-color-text);
  font-size: inherit;
  font-weight: var(--ui-type-label-weight);
  line-height: inherit;
}

/* Keep the header at label height as its actions change. */
.obs-property-section__actions,
.obs-property-section__action-slot {
  display: flex;
  align-items: center;
}

.obs-property-section__actions {
  gap: var(--ui-space-1);
  flex: none;
  margin-block: calc(
    (
        var(--obs-property-section-label-block-size) -
          var(--ui-icon-button-size-md)
      ) /
      2
  );
}

.obs-property-section__fields {
  min-inline-size: 0;
  display: grid;
  gap: var(--obs-property-section-field-gap, var(--ui-space-2));
}
</style>
