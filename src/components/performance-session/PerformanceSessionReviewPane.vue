<script setup>
import UiModal from '../ui/UiModal.vue';

defineOptions({ inheritAttrs: false });
defineProps({
  title: { type: String, required: true },
  bodyLabel: { type: String, required: true },
  saving: { type: Boolean, default: false },
});
defineEmits(['close']);
</script>

<template>
  <UiModal
    open
    :title="title"
    max-block-size="small"
    :selectable="false"
    :close-disabled="saving"
    @close="$emit('close')"
  >
    <section
      v-bind="$attrs"
      class="performance-session-review-pane"
      :aria-label="bodyLabel"
    >
      <slot />
    </section>
    <template v-if="$slots.actions" #footer>
      <slot name="actions" />
    </template>
  </UiModal>
</template>

<style scoped>
.performance-session-review-pane {
  min-inline-size: 0;
}
</style>
