<script setup>
import { computed } from 'vue';

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  describedBy: { type: String, default: '' },
  required: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  inline: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
});

const errorId = computed(() => (props.error ? `${props.id}-error` : ''));
const hintId = computed(() =>
  !props.error && props.hint ? `${props.id}-hint` : '',
);
const fieldInvalid = computed(() => props.invalid || Boolean(props.error));
const fieldDescribedBy = computed(() =>
  [
    ...new Set(
      [props.describedBy, errorId.value || hintId.value]
        .flatMap((value) => value.split(/\s+/))
        .filter(Boolean),
    ),
  ].join(' '),
);
</script>

<template>
  <div
    class="ui-field"
    :class="{ 'ui-field--inline': inline, 'is-invalid': fieldInvalid }"
  >
    <div class="ui-field__main">
      <label
        v-if="!inline"
        class="ui-field__label"
        :class="{ 'ui-field__label--hidden': labelHidden }"
        :for="id"
      >
        {{ label }}
        <span v-if="required" class="ui-field__required" aria-hidden="true"
          >＊</span
        >
      </label>

      <div class="ui-field__control">
        <slot
          :control-id="id"
          :described-by="fieldDescribedBy || undefined"
          :invalid="fieldInvalid"
        />
      </div>

      <label
        v-if="inline"
        class="ui-field__label ui-field__label--inline"
        :class="{ 'ui-field__label--hidden': labelHidden }"
        :for="id"
      >
        {{ label }}
        <span v-if="required" class="ui-field__required" aria-hidden="true"
          >＊</span
        >
      </label>
    </div>

    <p
      v-if="error"
      :id="errorId"
      class="ui-field__message is-error"
      role="alert"
    >
      {{ error }}
    </p>
    <p v-else-if="hint" :id="hintId" class="ui-field__message">
      {{ hint }}
    </p>
  </div>
</template>

<style scoped>
.ui-field {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.ui-field__main {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-1);
}

.ui-field--inline .ui-field__main {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ui-space-2);
}

.ui-field__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.ui-field__label--inline {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-regular);
}

.ui-field__label--hidden {
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

.ui-field__required,
.ui-field__message.is-error {
  color: var(--ui-color-danger);
}

.ui-field__control {
  min-width: 0;
}

.ui-field__message {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}
</style>
