<script setup>
defineProps({
  label: { type: String, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  selected: { type: Boolean, default: false },
});
</script>

<template>
  <span
    class="obs-preview-caption"
    :class="{ 'obs-preview-caption--selected': selected }"
  >
    <strong class="obs-preview-caption__label">{{ label }}</strong>
    <span class="obs-preview-caption__resolution"
      >{{ width }} × {{ height }}</span
    >
  </span>
</template>

<style scoped>
.obs-preview-caption {
  min-inline-size: 0;
  display: grid;
  justify-items: start;
  gap: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  text-align: start;
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.obs-preview-caption__label {
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.obs-preview-caption__resolution {
  font-variant-numeric: tabular-nums;
}

.obs-preview-caption--selected,
.obs-preview-caption--selected .obs-preview-caption__label {
  color: var(--ui-color-accent);
}
</style>
