<script setup>
import { onBeforeUnmount, shallowRef } from 'vue';
import { Volume2, VolumeX } from '../../icons/index.js';
import UiIconButton from './UiIconButton.vue';
import UiRangeControl from './range/UiRangeControl.vue';

const props = defineProps({
  variant: {
    type: String,
    default: 'expanded',
    validator: (value) => ['expanded', 'reveal'].includes(value),
  },
  revealSide: {
    type: String,
    default: 'start',
    validator: (value) => ['start', 'end'].includes(value),
  },
  modelValue: { type: Number, required: true },
  muted: { type: Boolean, default: false },
  active: { type: Boolean, default: false },
  volumeLabel: { type: String, required: true },
  muteLabel: { type: String, required: true },
  unmuteLabel: { type: String, required: true },
  tooltipSuffix: { type: String, default: '' },
  tooltipPlacement: { type: String, default: 'top' },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  step: { type: Number, default: 0.01 },
});
const emit = defineEmits(['update:modelValue', 'update:muted', 'change']);
const dragging = shallowRef(false);
let pointerId = null;
let dragWindow = null;

const formatPercent = (value) => `${Math.round(value * 100)}%`;

function stopDrag() {
  dragWindow?.removeEventListener('pointerup', endDrag, true);
  dragWindow?.removeEventListener('pointercancel', endDrag, true);
  dragWindow?.removeEventListener('blur', stopDrag);
  dragWindow = null;
  pointerId = null;
  dragging.value = false;
}

function endDrag(event) {
  if (event.pointerId === pointerId) stopDrag();
}

function startDrag(event) {
  if (props.variant !== 'reveal' || event.button !== 0 || dragging.value)
    return;
  const view = event.currentTarget.ownerDocument.defaultView;
  if (!view) return;
  dragWindow = view;
  pointerId = event.pointerId;
  dragging.value = true;
  view.addEventListener('pointerup', endDrag, true);
  view.addEventListener('pointercancel', endDrag, true);
  view.addEventListener('blur', stopDrag);
}

onBeforeUnmount(stopDrag);
</script>

<template>
  <div
    class="ui-volume-control"
    :class="[
      `ui-volume-control--${variant}`,
      {
        'ui-volume-control--reveal-end':
          variant === 'reveal' && revealSide === 'end',
      },
    ]"
    :data-dragging="dragging || undefined"
    role="group"
    :aria-label="volumeLabel"
  >
    <UiIconButton
      class="ui-volume-control__mute"
      :icon="muted || modelValue === 0 ? VolumeX : Volume2"
      :label="muted ? unmuteLabel : muteLabel"
      :active="active"
      :aria-pressed="muted"
      :tooltip-suffix="tooltipSuffix"
      :tooltip-placement="tooltipPlacement"
      @click="emit('update:muted', !muted)"
    />
    <div class="ui-volume-control__rail">
      <UiRangeControl
        class="ui-volume-control__range"
        :model-value="modelValue"
        :min="min"
        :max="max"
        :step="step"
        :aria-label="volumeLabel"
        :value-text="formatPercent(modelValue)"
        :format-value="formatPercent"
        @pointerdown="startDrag"
        @update:model-value="emit('update:modelValue', $event)"
        @change="emit('change', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.ui-volume-control {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-volume-control-gap, var(--ui-space-1));
  min-inline-size: 0;
}

.ui-volume-control__mute {
  flex: none;
}

.ui-volume-control__rail {
  flex: 1 1 var(--ui-volume-control-range-size, var(--ui-space-8));
  inline-size: var(--ui-volume-control-range-size, var(--ui-space-8));
  min-inline-size: var(--ui-space-7);
}

.ui-volume-control__range {
  inline-size: 100%;
}

@media (hover: hover) and (pointer: fine) {
  .ui-volume-control--reveal:not(.ui-volume-control--reveal-end) {
    position: relative;
    inline-size: max-content;
    margin-inline-start: calc(
      var(--ui-volume-control-range-size, var(--ui-space-8)) +
        var(--ui-volume-control-gap, var(--ui-space-1))
    );
  }

  .ui-volume-control--reveal:not(.ui-volume-control--reveal-end)
    .ui-volume-control__rail {
    position: absolute;
    inset-inline-end: 100%;
    inset-block: 0;
    display: flex;
    align-items: center;
    box-sizing: content-box;
    padding-inline-end: var(--ui-volume-control-gap, var(--ui-space-1));
    visibility: hidden;
    opacity: 0;
    transition: opacity var(--ui-motion-duration-fast);
  }

  .ui-volume-control--reveal:not(.ui-volume-control--reveal-end):is(
      :hover,
      :focus-within,
      [data-dragging]
    )
    .ui-volume-control__rail {
    visibility: visible;
    opacity: 1;
  }

  /* Keep the hit area and the neighbouring close button at fixed positions. */
  .ui-volume-control--reveal-end {
    --ui-volume-reveal-reserve: calc(
      var(--ui-volume-control-range-size, var(--ui-space-8)) +
        var(--ui-volume-control-gap, var(--ui-space-1))
    );
    inline-size: calc(
      var(--ui-icon-button-size-md) + var(--ui-volume-reveal-reserve)
    );
    justify-content: flex-end;
    gap: 0;
  }

  .ui-volume-control--reveal-end .ui-volume-control__rail {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: none;
    inline-size: 0;
    min-inline-size: 0;
    overflow: clip;
    pointer-events: none;
    transition: inline-size var(--ui-motion-duration-standard)
      var(--ui-motion-easing-standard);
  }

  .ui-volume-control--reveal-end .ui-volume-control__range {
    flex: 0 0 var(--ui-volume-control-range-size, var(--ui-space-8));
  }

  .ui-volume-control--reveal-end:is(
      :hover,
      :has(:focus-visible),
      [data-dragging]
    )
    .ui-volume-control__rail {
    inline-size: var(--ui-volume-reveal-reserve);
    pointer-events: auto;
  }

  .ui-volume-control--reveal-end:has(:focus-visible) .ui-volume-control__rail {
    overflow: visible;
    transition-duration: 0ms;
  }
}
</style>
