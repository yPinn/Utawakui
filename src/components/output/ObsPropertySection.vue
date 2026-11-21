<script setup>
import { computed } from 'vue';
import { RotateCcw } from '../../icons/index.js';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  title: { type: String, default: '' },
  modified: { type: Boolean, default: false },
});

const emit = defineEmits(['reset']);

const resetLabel = computed(() =>
  t('outputPanel.field.resetNamed', { title: props.title }),
);
</script>

<template>
  <component :is="title ? 'section' : 'div'" class="obs-property-section">
    <header v-if="title" class="obs-property-section__header">
      <h3 class="obs-property-section__title">{{ title }}</h3>
      <UiIconButton
        v-if="modified"
        class="obs-property-section__reset"
        :icon="RotateCcw"
        :label="resetLabel"
        variant="ghost"
        @click="emit('reset')"
      />
    </header>
    <slot name="description" />
    <div class="obs-property-section__fields">
      <slot />
    </div>
  </component>
</template>

<style scoped>
.obs-property-section {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-block: var(--ui-space-3);
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

/* Keep the header at label height whether or not the reset action is shown. */
.obs-property-section__reset {
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
  gap: var(--ui-space-2);
}
</style>
