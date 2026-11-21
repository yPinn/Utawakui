<script setup>
import { t } from '../../utils/i18n.js';
defineProps({
  controlId: { type: String, required: true },
  label: { type: String, required: true },
  labelsControl: { type: Boolean, default: true },
  alignStart: { type: Boolean, default: false },
  stacked: { type: Boolean, default: false },
  modified: { type: Boolean, default: false },
});
</script>

<template>
  <div
    class="obs-appearance-control-row"
    :class="{
      'obs-appearance-control-row--align-start': alignStart,
      'obs-appearance-control-row--stacked': stacked,
    }"
  >
    <label
      v-if="labelsControl"
      class="obs-appearance-control-row__label"
      :for="controlId"
    >
      {{ label }}
      <span
        v-if="modified"
        class="obs-appearance-control-row__modified"
        data-modified
      >
        <span class="ui-visually-hidden">{{
          t('outputPanel.field.modified')
        }}</span>
      </span>
    </label>
    <span v-else class="obs-appearance-control-row__label" aria-hidden="true">
      {{ label }}
      <span
        v-if="modified"
        class="obs-appearance-control-row__modified"
        data-modified
      />
    </span>
    <div class="obs-appearance-control-row__control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.obs-appearance-control-row {
  min-inline-size: 0;
  min-block-size: var(--ui-control-height);
  display: grid;
  grid-template-columns: var(--ui-output-setting-label-min-width) minmax(
      0,
      1fr
    );
  align-items: center;
  gap: var(--ui-space-3);
}

.obs-appearance-control-row__label {
  overflow-wrap: anywhere;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-compact-line-height);
}

.obs-appearance-control-row__modified {
  display: inline-block;
  inline-size: var(--ui-status-dot-size);
  block-size: var(--ui-status-dot-size);
  margin-inline-start: var(--ui-space-1);
  vertical-align: middle;
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-accent);
}

.obs-appearance-control-row__control {
  min-inline-size: 0;
}

.obs-appearance-control-row--align-start {
  align-items: start;
}

.obs-appearance-control-row--align-start .obs-appearance-control-row__label {
  padding-block-start: var(--obs-appearance-label-inset, var(--ui-space-2));
}

.obs-appearance-control-row--stacked {
  --obs-appearance-label-inset: var(--ui-space-0);
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-1);
}
</style>
