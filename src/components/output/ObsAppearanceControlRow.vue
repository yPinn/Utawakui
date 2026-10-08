<script setup>
defineProps({
  controlId: { type: String, required: true },
  label: { type: String, required: true },
  labelsControl: { type: Boolean, default: true },
  alignStart: { type: Boolean, default: false },
});
</script>

<template>
  <div
    class="obs-appearance-control-row"
    :class="{ 'obs-appearance-control-row--align-start': alignStart }"
  >
    <label
      v-if="labelsControl"
      class="obs-appearance-control-row__label"
      :for="controlId"
    >
      {{ label }}
    </label>
    <span v-else class="obs-appearance-control-row__label" aria-hidden="true">
      {{ label }}
    </span>
    <div class="obs-appearance-control-row__control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.obs-appearance-control-row {
  min-width: 0;
  min-height: calc(var(--ui-control-height) + var(--ui-space-2));
  display: grid;
  grid-template-columns: var(--ui-output-setting-label-width-min) minmax(
      0,
      1fr
    );
  align-items: center;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-1);
}

.obs-appearance-control-row__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-label);
}

.obs-appearance-control-row__control {
  min-width: 0;
}

.obs-appearance-control-row--align-start {
  align-items: start;
}

.obs-appearance-control-row--align-start .obs-appearance-control-row__label {
  padding-block-start: var(--ui-space-2);
}
</style>
