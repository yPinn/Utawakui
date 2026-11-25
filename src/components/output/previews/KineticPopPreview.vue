<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
} from 'vue';
import gsap from 'gsap';
import { OUTPUT_LOOK_PRESETS } from '../../../../shared/outputAppearance.mjs';
import {
  clearKineticPopPresentation,
  renderKineticPopPresentation,
} from '../../../../shared/browser/kineticPop.mjs';
import { adaptKineticPopLyricsPresentation } from '../../../../shared/presentation/lyricsPresentation.mjs';
import { useOutputPreviewMotion } from '../../../composables/output/useOutputPreviewMotion.js';
import { OUTPUT_LYRICS_CAPTURE_SIZE } from '../../../constants/outputCaptureSizes.js';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  animated: { type: Boolean, default: false },
});

const canvasContent = useTemplateRef('canvasContent');
const stage = useTemplateRef('stage');
const current = useTemplateRef('current');
const painted = shallowRef(false);
const canvasWidth = shallowRef(0);
const hasCanvasWidth = computed(() => canvasWidth.value > 0);
let resizeObserver;
const arrangement = computed(
  () => props.scene.lyrics?.kinetic?.arrangement ?? 'straight',
);
const presentation = computed(
  () =>
    props.scene.frame?.kineticPop ??
    adaptKineticPopLyricsPresentation(props.scene.lyrics?.current, {
      kineticMaterial: props.scene.lyrics?.kinetic?.material,
      phraseIndex: 0,
    }),
);
const stageStyle = computed(() => {
  const style = {
    '--kinetic-rem': `${(canvasWidth.value / OUTPUT_LYRICS_CAPTURE_SIZE.width) * 16}px`,
  };
  const { paletteId, lookAmount } = props.scene.appearance ?? {};
  if (!(lookAmount > 0) || !Object.hasOwn(OUTPUT_LOOK_PRESETS, paletteId))
    return style;
  return {
    ...style,
    '--ovl-look-amount': `${lookAmount}%`,
    ...Object.fromEntries(
      Object.entries(OUTPUT_LOOK_PRESETS[paletteId].colors ?? {})
        .filter(([role]) => role.startsWith('kinetic-'))
        .map(([role, color]) => [`--ovl-look-color-${role}`, color]),
    ),
  };
});
const SAMPLE_DURATION_MS = 3200;

onMounted(() => {
  // Passing a concrete length avoids Chromium resolving cqi through the glyph layers.
  resizeObserver = new ResizeObserver(([entry]) => {
    canvasWidth.value = entry.contentRect.width;
  });
  resizeObserver.observe(canvasContent.value);
});

function elements() {
  return { root: stage.value, current: current.value };
}

function paint(kineticPop, kineticPopClock, positionAt) {
  renderKineticPopPresentation(
    elements(),
    {
      ...props.scene.frame,
      visible: true,
      kineticPop,
      kineticPopClock,
    },
    {
      gsap,
      arrangement: arrangement.value,
      positionAt,
      reducedMotion: !positionAt,
    },
  );
  painted.value = true;
}

useOutputPreviewMotion({
  scene: () => (hasCanvasWidth.value ? props.scene : null),
  animated: () => props.animated && hasCanvasWidth.value,
  start() {
    const { sourceText, material, phrases, phraseBreakProgresses } =
      presentation.value;
    if (phrases.length === 0) return;
    const batches = phrases.map((_, phraseIndex) =>
      adaptKineticPopLyricsPresentation(sourceText, {
        phraseRanges: phrases,
        phraseIndex,
        kineticMaterial: material,
      }),
    );
    const holdMs = 500;
    const duration = Math.max(SAMPLE_DURATION_MS, batches.length * holdMs);
    const boundaries = [0, ...phraseBreakProgresses, 1].map(
      (part, index) =>
        index * holdMs + part * (duration - batches.length * holdMs),
    );
    const epoch = performance.now();
    let timer;
    const replay = () => {
      const elapsed = performance.now() - epoch;
      const cycle = epoch + Math.floor(elapsed / duration) * duration;
      const positionMs = elapsed % duration;
      const index = boundaries.findLastIndex((at) => at <= positionMs);
      const endMs = boundaries[index + 1];
      paint(
        batches[index],
        { startMs: boundaries[index], endMs, positionMs, playing: true },
        () => performance.now() - cycle,
      );
      timer = setTimeout(replay, Math.max(1, endMs - positionMs));
    };
    replay();
    return () => clearTimeout(timer);
  },
  renderStatic() {
    if (hasCanvasWidth.value) paint(presentation.value);
  },
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  clearKineticPopPresentation(elements());
});
</script>

<template>
  <div
    ref="canvasContent"
    class="obs-template-mockup__content obs-template-mockup__content--lyrics"
  >
    <span
      ref="stage"
      class="obs-template-mockup__kinetic-stage"
      data-kinetic-stage
      :data-ovl-scale="scene.appearance?.fontScale"
      :lang="scene.frame?.language || 'und'"
      :data-ovl-kinetic-arrangement="arrangement"
      :style="stageStyle"
    >
      <span v-if="!painted" data-kinetic-current>
        <span
          class="lyrics-overlay__kinetic-line"
          :data-kinetic-material="presentation.material"
          :data-kinetic-composition="presentation.composition"
        >
          <span class="lyrics-overlay__kinetic-row">
            <span
              v-for="layer in ['depth', 'rim', 'fill']"
              :key="layer"
              class="lyrics-overlay__kinetic-layer"
              :class="`lyrics-overlay__kinetic-layer--${layer}`"
              >{{ presentation.displayText }}</span
            >
          </span>
        </span>
      </span>
      <span
        ref="current"
        data-kinetic-current
        :style="{ visibility: painted ? undefined : 'hidden' }"
      />
    </span>
  </div>
</template>

<style src="../../../../overlay/lyrics/kineticPop.css"></style>
<style src="./KineticPopPreview.css"></style>
