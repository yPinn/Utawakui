<script setup>
const props = defineProps({
  name: { type: String, required: true },
  legend: { type: String, required: true },
  items: { type: Array, default: () => [] },
  modelValue: { type: [String, Number], default: '' },
  orientation: {
    type: String,
    default: 'vertical',
    validator: (value) => ['horizontal', 'vertical'].includes(value),
  },
  disabled: { type: Boolean, default: false },
  legendHidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);

function optionId(item) {
  return `${props.name}-${String(item.id).replace(/[^a-z0-9_-]+/giu, '-')}`;
}

function select(item) {
  if (!props.disabled && !item.disabled) emit('update:modelValue', item.id);
}
</script>

<template>
  <fieldset
    class="ui-radio-group"
    :class="`ui-radio-group--${props.orientation}`"
    :disabled="props.disabled"
  >
    <legend
      class="ui-radio-group__legend"
      :class="{ 'ui-radio-group__legend--hidden': props.legendHidden }"
    >
      {{ props.legend }}
    </legend>
    <div class="ui-radio-group__options">
      <label
        v-for="item in props.items"
        :key="item.id"
        class="ui-radio-group__option"
        :class="{
          'ui-radio-group__option--checked': Object.is(
            item.id,
            props.modelValue,
          ),
          'ui-radio-group__option--disabled': props.disabled || item.disabled,
        }"
        :for="optionId(item)"
      >
        <input
          :id="optionId(item)"
          class="ui-radio-group__input"
          type="radio"
          :name="props.name"
          :value="item.id"
          :checked="Object.is(item.id, props.modelValue)"
          :disabled="props.disabled || item.disabled"
          @change="select(item)"
        />
        <span class="ui-radio-group__indicator" aria-hidden="true" />
        <span class="ui-radio-group__copy">
          <span class="ui-radio-group__label">
            <slot name="label" :item="item">{{ item.label }}</slot>
          </span>
          <span v-if="item.description" class="ui-radio-group__description">
            {{ item.description }}
          </span>
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.ui-radio-group {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.ui-radio-group__legend {
  margin-block-end: var(--ui-space-2);
  padding: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.ui-radio-group__legend--hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.ui-radio-group__options {
  min-width: 0;
  display: flex;
  gap: var(--ui-space-2);
}

.ui-radio-group--vertical .ui-radio-group__options {
  flex-direction: column;
}

.ui-radio-group--horizontal .ui-radio-group__options {
  flex-wrap: wrap;
}

.ui-radio-group__option {
  position: relative;
  min-width: 0;
  min-height: var(--ui-control-height);
  display: grid;
  grid-template-columns: var(--ui-radio-size) minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-color-text);
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
}

.ui-radio-group__option:hover:not(.ui-radio-group__option--disabled) {
  background: var(--ui-color-surface-hover);
}

.ui-radio-group__option--checked {
  background: var(--ui-color-surface-selected);
}

.ui-radio-group__option--disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-radio-group__input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.ui-radio-group__input:focus-visible + .ui-radio-group__indicator {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-radio-group__indicator {
  inline-size: var(--ui-radio-size);
  block-size: var(--ui-radio-size);
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: 50%;
  background: var(--ui-field-bg);
}

.ui-radio-group__indicator::after {
  content: '';
  inline-size: var(--ui-radio-dot-size);
  block-size: var(--ui-radio-dot-size);
  border-radius: 50%;
  background: var(--ui-color-accent);
  transform: scale(0);
  transition: transform var(--ui-motion-duration-feedback)
    var(--ui-motion-easing-standard);
}

.ui-radio-group__input:checked + .ui-radio-group__indicator {
  border-color: var(--ui-color-accent);
}

.ui-radio-group__input:checked + .ui-radio-group__indicator::after {
  transform: scale(1);
}

.ui-radio-group__copy {
  min-width: 0;
  display: grid;
  gap: calc(var(--ui-space-1) / 2);
}

.ui-radio-group__label {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.ui-radio-group__description {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

:global(:root[data-ui-motion='reduced']) .ui-radio-group__indicator::after {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-radio-group__indicator::after {
    transition: none;
  }
}
</style>
