<script setup>
defineProps({
  open: { type: Boolean, default: false },
  text: { type: String, required: true },
  suffix: { type: String, default: '' },
  detail: { type: String, default: '' },
  tooltipId: { type: String, required: true },
  position: { type: Object, required: true },
  placement: { type: String, required: true },
  setElement: { type: Function, required: true },
});
</script>

<template>
  <Teleport v-if="open" to="body">
    <span
      :id="tooltipId"
      :ref="setElement"
      class="ui-tooltip"
      role="tooltip"
      :data-placement="placement"
      :style="position"
    >
      <span class="ui-tooltip__label"
        >{{ text
        }}<span v-if="suffix" class="ui-tooltip__no-break">{{
          suffix
        }}</span></span
      >
      <span v-if="detail" class="ui-tooltip__detail">{{ detail }}</span>
    </span>
  </Teleport>
</template>

<style scoped>
.ui-tooltip {
  position: fixed;
  z-index: var(--ui-z-tooltip);
  box-sizing: border-box;
  inline-size: max-content;
  max-inline-size: min(
    var(--ui-tooltip-max-inline-size),
    calc(100vw - (2 * var(--ui-floating-viewport-inset)))
  );
  padding: var(--ui-space-1) var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-tooltip-border);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-tooltip-background);
  box-shadow: var(--ui-tooltip-shadow);
  color: var(--ui-tooltip-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-tooltip-font-size);
  font-weight: var(--ui-tooltip-font-weight);
  line-height: var(--ui-tooltip-line-height);
  overflow-wrap: anywhere;
  pointer-events: none;
  -webkit-user-select: none;
  user-select: none;
}

.ui-tooltip__label,
.ui-tooltip__detail {
  display: block;
}

.ui-tooltip__no-break {
  white-space: nowrap;
}

.ui-tooltip__detail {
  color: var(--ui-tooltip-detail-text);
}
</style>
