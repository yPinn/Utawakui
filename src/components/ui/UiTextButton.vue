<script setup>
// Wraps overflow text in a real <button> so a caller can make it its own
// click target, separate from a row's primary action. Marquee remains the
// default; high-volume surfaces can opt into static ellipsis to avoid an
// animation lane per row, and headlines into a clamp.
import { computed, mergeProps, shallowRef, useAttrs } from 'vue';
import { nativeButtonAttrs } from './buttonAttrs.js';
import UiMarqueeText from './UiMarqueeText.vue';
import UiOverflowTooltip from './UiOverflowTooltip.vue';

const props = defineProps({
  text: { type: [String, Number], default: '' },
  ariaLabel: { type: String, default: undefined },
  overflow: {
    type: String,
    default: 'marquee',
    validator: (value) => ['marquee', 'ellipsis', 'clamp'].includes(value),
  },
});

const emit = defineEmits(['click']);
defineOptions({ inheritAttrs: false });
const attrs = useAttrs();
const overflowOwner = shallowRef(null);
const displayText = computed(() => String(props.text ?? ''));

function isDisabled() {
  return (
    attrs.disabled === '' ||
    Boolean(attrs.disabled) ||
    attrs['aria-disabled'] === true ||
    attrs['aria-disabled'] === 'true'
  );
}

function buttonAttrs() {
  // The button owns keyboard focus; its measured text child owns the hint.
  const trigger = overflowOwner.value?.triggerProps ?? {};
  return mergeProps(nativeButtonAttrs(attrs, isDisabled()), {
    'aria-describedby':
      [attrs['aria-describedby'], trigger['aria-describedby']]
        .filter(Boolean)
        .join(' ') || undefined,
    onFocusin: trigger.onFocusin,
    onFocusout: trigger.onFocusout,
    onKeydown: trigger.onKeydown,
  });
}

function handleClick(event) {
  if (!isDisabled()) emit('click', event);
}
</script>

<template>
  <button
    type="button"
    class="ui-text-btn"
    v-bind="buttonAttrs()"
    :aria-label="ariaLabel"
    @click.stop="handleClick"
  >
    <UiMarqueeText
      v-if="overflow === 'marquee'"
      ref="overflowOwner"
      :text="displayText"
      :tooltip-enabled="!isDisabled()"
    />
    <UiOverflowTooltip
      v-else
      ref="overflowOwner"
      class="ui-text-btn__text"
      :class="{ 'ui-text-btn__text--clamp': overflow === 'clamp' }"
      :text="displayText"
      :tooltip-enabled="!isDisabled()"
    >
      {{ displayText }}
    </UiOverflowTooltip>
  </button>
</template>

<style scoped>
.ui-text-btn {
  display: block;
  /* fit-content (not 100%) so the clickable hit-box hugs the actual text,
     not the full available width — several callers stack this over a
     larger row-level click target (e.g. QueueTrackButton's shared row),
     and a full-width invisible click box past a short title would steal
     clicks meant for that underlying target. max-width still caps it to
     the available space so UiMarqueeText's own overflow measurement
     (against its clientWidth) is unaffected — when the title is long
     enough to actually need truncation/marquee, this still fills it. */
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  /* Never font-weight — callers set their own on this class, and resetting
     it here would fight that on cascade order. */
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  text-align: start;
  cursor: pointer;
}

/* inherit would keep the parent's resolved face; a lang tag re-resolves it. */
.ui-text-btn[lang] {
  font-family: var(--ui-font-family-base);
}

@scope ([data-ui-system='v2']) to ([data-ui-system]) {
  .ui-text-btn {
    -webkit-user-select: none;
    user-select: none;
  }

  .ui-text-btn:disabled,
  .ui-text-btn[aria-disabled='true'] {
    opacity: var(--ui-opacity-disabled);
    cursor: default;
  }
}

.ui-text-btn :deep(.ui-text-btn__text) {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Headline callers wrap to two lines instead of one. The clip hides line
   three, so callers need title leading or looser to keep the last line's
   underline inside the box. */
.ui-text-btn :deep(.ui-text-btn__text--clamp) {
  display: -webkit-box;
  white-space: normal;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* Both overflow owners are child components. Reach their painted text roots
   explicitly so inserting a Tooltip wrapper cannot sever hover/focus paint. */
.ui-text-btn:not(:disabled):not([aria-disabled='true']):hover
  :deep(.ui-marquee__text),
.ui-text-btn:not(:disabled):not([aria-disabled='true']):focus-visible
  :deep(.ui-marquee__text),
.ui-text-btn:not(:disabled):not([aria-disabled='true']):hover
  :deep(.ui-text-btn__text),
.ui-text-btn:not(:disabled):not([aria-disabled='true']):focus-visible
  :deep(.ui-text-btn__text) {
  text-decoration: underline;
  text-underline-offset: 0.18em;
}

.ui-text-btn:is(:disabled, [aria-disabled='true']) :deep(.ui-marquee__text) {
  max-width: 100%;
  padding-right: 0;
  animation: none;
  will-change: auto;
}

.ui-text-btn:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
  border-radius: var(--ui-focus-radius);
}
</style>
