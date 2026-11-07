<script setup>
import { computed, onBeforeUnmount, shallowRef } from 'vue';
import { Volume2, VolumeX } from '../../icons/index.js';
import UiIconButton from './UiIconButton.vue';
import UiRangeControl from './range/UiRangeControl.vue';

const props = defineProps({
  variant: {
    type: String,
    default: 'expanded',
    validator: (value) => ['expanded', 'reveal'].includes(value),
  },
  inline: { type: Boolean, default: false },
  revealSide: {
    type: String,
    default: 'start',
    validator: (value) => ['start', 'end'].includes(value),
  },
  modelValue: { type: Number, required: true },
  muted: { type: Boolean, default: false },
  toggleMode: {
    type: String,
    default: 'mute',
    validator: (value) => ['mute', 'sound'].includes(value),
  },
  active: { type: Boolean, default: false },
  volumeLabel: { type: String, required: true },
  muteLabel: { type: String, required: true },
  unmuteLabel: { type: String, required: true },
  tooltipSuffix: { type: String, default: '' },
  tooltipPlacement: { type: String, default: 'top' },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  step: { type: Number, default: 0.01 },
  defaultValue: { type: Number, default: undefined },
});
const emit = defineEmits(['update:modelValue', 'update:muted', 'change']);
const controlOrder = computed(() =>
  props.variant === 'reveal' && props.revealSide === 'start'
    ? ['range', 'mute']
    : ['mute', 'range'],
);
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
        'ui-volume-control--inline': variant === 'reveal' && inline,
        'ui-volume-control--reveal-end':
          variant === 'reveal' && revealSide === 'end',
      },
    ]"
    :data-dragging="dragging || undefined"
    role="group"
    :aria-label="volumeLabel"
  >
    <template v-for="control in controlOrder" :key="control">
      <UiIconButton
        v-if="control === 'mute'"
        class="ui-volume-control__mute"
        :icon="
          muted || (toggleMode === 'mute' && modelValue === 0)
            ? VolumeX
            : Volume2
        "
        :label="muted ? unmuteLabel : muteLabel"
        :active="active"
        :aria-pressed="toggleMode === 'sound' ? !muted : muted"
        :tooltip-suffix="tooltipSuffix"
        :tooltip-placement="tooltipPlacement"
        @click="emit('update:muted', !muted)"
      />
      <div v-else class="ui-volume-control__rail">
        <UiRangeControl
          class="ui-volume-control__range"
          :model-value="modelValue"
          :min="min"
          :max="max"
          :step="step"
          :default-value="defaultValue"
          :aria-label="volumeLabel"
          :value-text="formatPercent(modelValue)"
          :format-value="formatPercent"
          @pointerdown="startDrag"
          @update:model-value="emit('update:modelValue', $event)"
          @change="emit('change', $event)"
        />
      </div>
    </template>
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

.ui-volume-control--inline {
  inline-size: 100%;
  gap: 0;
}

.ui-volume-control--inline .ui-volume-control__rail {
  position: relative;
  flex: 1 1 0;
  min-inline-size: 0;
  padding-inline-end: var(--ui-volume-control-gap, var(--ui-space-1));
}
.ui-volume-control--inline.ui-volume-control--reveal-end
  .ui-volume-control__rail {
  padding-inline: var(--ui-volume-control-gap, var(--ui-space-1)) 0;
}

@media (hover: hover) and (pointer: fine) {
  .ui-volume-control--reveal:not(.ui-volume-control--inline) {
    --ui-volume-reveal-reserve: calc(
      var(--ui-volume-control-range-size, var(--ui-space-8)) +
        var(--ui-volume-control-gap, var(--ui-space-1))
    );
    position: relative;
    inline-size: max-content;
    margin-inline-start: var(--ui-volume-reveal-reserve);
  }
  /* Keep a fixed hover area and give back space on the left as the rail grows. */
  .ui-volume-control--reveal-end:not(.ui-volume-control--inline) {
    inline-size: calc(
      var(--ui-icon-button-size-md) + var(--ui-volume-reveal-reserve)
    );
    justify-content: flex-end;
    gap: 0;
    margin-inline-start: 0;
  }

  .ui-volume-control--reveal:not(
      .ui-volume-control--inline,
      .ui-volume-control--reveal-end
    )
    .ui-volume-control__rail {
    position: absolute;
    inset-inline-end: 100%;
    inset-block: 0;
    display: flex;
    align-items: center;
    box-sizing: content-box;
    padding-inline-end: var(--ui-volume-control-gap, var(--ui-space-1));
  }

  .ui-volume-control--inline,
  .ui-volume-control--reveal .ui-volume-control__rail {
    pointer-events: none;
  }

  .ui-volume-control--inline .ui-volume-control__mute {
    pointer-events: auto;
  }

  /* Keep the hidden range in Tab order. The rail padding bridges the hover gap. */
  .ui-volume-control--reveal .ui-volume-control__range {
    --ui-volume-reveal-inset: calc(-1 * var(--ui-focus-safe-inset));
    --ui-volume-reveal-clip-start: 100%;
    --ui-volume-reveal-clip-end: 0%;

    clip-path: inset(
      var(--ui-volume-reveal-inset) var(--ui-volume-reveal-clip-end)
        var(--ui-volume-reveal-inset) var(--ui-volume-reveal-clip-start)
    );
    transition: clip-path var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard);
  }
  .ui-volume-control--reveal-end .ui-volume-control__range {
    --ui-volume-reveal-clip-start: 0%;
    --ui-volume-reveal-clip-end: 100%;
  }
  .ui-volume-control--reveal:dir(rtl) .ui-volume-control__range {
    clip-path: inset(
      var(--ui-volume-reveal-inset) var(--ui-volume-reveal-clip-start)
        var(--ui-volume-reveal-inset) var(--ui-volume-reveal-clip-end)
    );
  }

  .ui-volume-control--reveal:is(:hover, :has(:focus-visible), [data-dragging])
    .ui-volume-control__rail {
    pointer-events: auto;
  }

  .ui-volume-control--reveal:is(:hover, :has(:focus-visible), [data-dragging])
    .ui-volume-control__range {
    clip-path: inset(var(--ui-volume-reveal-inset));
    transition-duration: var(--ui-motion-duration-fast);
  }

  .ui-volume-control--reveal:has(:focus-visible) .ui-volume-control__range {
    transition-duration: 0ms;
  }

  .ui-volume-control--reveal-end:not(.ui-volume-control--inline)
    .ui-volume-control__rail {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: none;
    inline-size: 0;
    min-inline-size: 0;
    overflow: clip;
    transition: inline-size var(--ui-motion-duration-standard)
      var(--ui-motion-easing-standard);
  }

  .ui-volume-control--reveal-end:not(.ui-volume-control--inline)
    .ui-volume-control__range {
    flex: 0 0 var(--ui-volume-control-range-size, var(--ui-space-8));
    clip-path: none;
  }

  .ui-volume-control--reveal-end:not(.ui-volume-control--inline):is(
      :hover,
      :has(:focus-visible),
      [data-dragging]
    )
    .ui-volume-control__rail {
    inline-size: var(--ui-volume-reveal-reserve);
  }

  .ui-volume-control--reveal-end:not(.ui-volume-control--inline):has(
      :focus-visible
    )
    .ui-volume-control__rail {
    overflow: visible;
    transition-duration: 0ms;
  }
}
</style>
