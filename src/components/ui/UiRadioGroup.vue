<script setup>
import { useId } from 'vue';

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
  appearance: {
    type: String,
    default: 'list',
    validator: (value) => ['list', 'tiles'].includes(value),
  },
  disabled: { type: Boolean, default: false },
  legendHidden: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
const instanceId = `ui-radio-${useId()}`;

function optionId(item) {
  // Keep Unicode and punctuation distinct, including numeric vs. string keys.
  const key = Array.from(String(item.id), (character) =>
    character.codePointAt(0).toString(16),
  ).join('-');
  return `${instanceId}-${typeof item.id}-${key}`;
}

function select(item) {
  if (!props.disabled && !item.disabled) emit('update:modelValue', item.id);
}
</script>

<template>
  <fieldset
    class="ui-radio-group"
    :class="[
      `ui-radio-group--${props.orientation}`,
      `ui-radio-group--${props.appearance}`,
    ]"
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
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
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

/* Rich choices keep their content caller-owned while this primitive retains
   radio semantics, indicator, states and the option surface. The caller may
   map the responsive column tracks and gap without reaching into anatomy. */
.ui-radio-group--tiles .ui-radio-group__options {
  display: grid;
  grid-template-columns: var(
    --ui-radio-group-option-columns,
    repeat(auto-fit, minmax(min(100%, 12rem), 1fr))
  );
  gap: var(--ui-radio-group-option-gap, var(--ui-space-3));
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

.ui-radio-group--tiles .ui-radio-group__option {
  align-content: start;
  align-items: start;
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface-raised);
}

.ui-radio-group--list .ui-radio-group__option {
  align-content: start;
  align-items: start;
  padding-block: max(0rem, calc((var(--ui-control-height) - 1lh) / 2));
  font-size: var(--ui-type-label-size);
  line-height: var(--ui-type-label-line-height);
}

.ui-radio-group--list .ui-radio-group__indicator {
  margin-block-start: max(0rem, calc((1lh - var(--ui-radio-size)) / 2));
}

.ui-radio-group__option:hover:not(.ui-radio-group__option--disabled):not(
    .ui-radio-group__option--checked
  ) {
  background: var(--ui-color-surface-hover);
}

.ui-radio-group--tiles
  .ui-radio-group__option:hover:not(.ui-radio-group__option--disabled):not(
    .ui-radio-group__option--checked
  ) {
  border-color: var(--ui-color-border-strong);
}

.ui-radio-group__option--checked {
  background: var(--ui-color-surface-selected);
}

.ui-radio-group--tiles .ui-radio-group__option--checked {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-surface-selected);
}

.ui-radio-group__option--disabled {
  cursor: not-allowed;
  opacity: var(--ui-opacity-disabled);
}

.ui-radio-group__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.ui-radio-group__input:focus-visible + .ui-radio-group__indicator {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-radio-group--tiles
  .ui-radio-group__option:has(.ui-radio-group__input:focus-visible) {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.ui-radio-group--tiles
  .ui-radio-group__input:focus-visible
  + .ui-radio-group__indicator {
  outline: 0;
}

.ui-radio-group__indicator {
  inline-size: var(--ui-radio-size);
  block-size: var(--ui-radio-size);
  display: grid;
  place-items: center;
  border: var(--ui-border-width) solid var(--ui-color-control-boundary);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-field-bg);
}

.ui-radio-group__indicator::after {
  content: '';
  inline-size: var(--ui-radio-dot-size);
  block-size: var(--ui-radio-dot-size);
  border-radius: var(--ui-radius-pill);
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

.ui-radio-group--tiles .ui-radio-group__copy {
  grid-column: 1 / -1;
}

.ui-radio-group__label {
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.ui-radio-group__description {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  overflow-wrap: anywhere;
}

:global(:root[data-ui-motion='reduced'] .ui-radio-group__indicator::after) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .ui-radio-group__indicator::after {
    transition: none;
  }
}
</style>
