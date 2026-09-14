<script setup>
import { useAttrs, useTemplateRef } from 'vue';
import { nativeControlAttrs } from './fieldAttrs.js';
import UiField from './UiField.vue';

defineOptions({ inheritAttrs: false });

defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const attrs = useAttrs();
const switchRef = useTemplateRef('switch');

function focus() {
  switchRef.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <UiField
    :id="id"
    :class="attrs.class"
    :style="attrs.style"
    :label="label"
    :hint="hint"
    :error="error"
    :described-by="attrs['aria-describedby']"
    :required="required"
    :invalid="invalid"
    inline
  >
    <template #default="{ describedBy, invalid: fieldInvalid }">
      <span class="ui-switch">
        <input
          v-bind="nativeControlAttrs(attrs)"
          :id="id"
          ref="switch"
          class="ui-switch__native"
          type="checkbox"
          role="switch"
          :checked="modelValue"
          :required="required"
          :disabled="disabled"
          :aria-describedby="describedBy"
          :aria-invalid="fieldInvalid || undefined"
          @change="emit('update:modelValue', $event.target.checked)"
        />
        <span class="ui-switch__track" aria-hidden="true">
          <span class="ui-switch__thumb"></span>
        </span>
      </span>
    </template>
  </UiField>
</template>

<style scoped>
.ui-switch {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}

.ui-switch__native {
  position: absolute;
  z-index: 1;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.ui-switch__track {
  box-sizing: border-box;
  width: var(--ui-switch-track-width);
  height: var(--ui-switch-track-height);
  display: block;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-surface-raised);
  pointer-events: none;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    border-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-switch__thumb {
  display: block;
  width: var(--ui-switch-thumb-size);
  height: var(--ui-switch-thumb-size);
  margin: var(--ui-switch-thumb-inset);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-text-muted);
  transition:
    transform var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
}

.ui-switch__native:checked + .ui-switch__track {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-accent);
}

.ui-switch__native:checked + .ui-switch__track .ui-switch__thumb {
  background: var(--ui-color-accent-contrast);
  transform: translateX(
    calc(
      var(--ui-switch-track-width) - var(--ui-switch-thumb-size) -
        (var(--ui-switch-thumb-inset) * 2)
    )
  );
}

.ui-switch__native:hover:not(:disabled) + .ui-switch__track {
  border-color: var(--ui-color-accent);
}

.ui-switch__native:focus-visible + .ui-switch__track {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-switch__native:disabled + .ui-switch__track {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-switch__native:disabled {
  cursor: not-allowed;
}

:global(:root[data-ui-motion='reduced']) .ui-switch__thumb,
:global(:root[data-ui-motion='reduced']) .ui-switch__track {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-switch__thumb,
  .ui-switch__track {
    transition: none;
  }
}
</style>
