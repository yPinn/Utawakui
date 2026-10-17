<script setup>
import { computed } from 'vue';
import {
  kineticPopBurstDelaySeconds,
  kineticPopRestPose,
} from '../../../../shared/presentation/kineticPopMotion.mjs';
import { adaptKineticPopLyricsPresentation } from '../../../../shared/presentation/lyricsPresentation.mjs';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const lyrics = computed(() => props.scene?.lyrics ?? {});
const kineticPreviewArrangement = computed(
  () => lyrics.value.kinetic?.arrangement ?? 'straight',
);
const kineticPreviewLine = computed(() => {
  const presentation = adaptKineticPopLyricsPresentation(lyrics.value.current, {
    kineticMaterial: 'candy-rim',
  });
  let unitIndex = 0;
  return {
    ...presentation,
    rows: presentation.rows.map((row) => {
      return {
        ...row,
        units: row.units.map((unit) => {
          const restPose = kineticPopRestPose(
            unitIndex,
            kineticPreviewArrangement.value,
          );
          const previewUnit = {
            delay: `${kineticPopBurstDelaySeconds(unitIndex)}s`,
            restRotation: `${restPose.rotation}deg`,
            restScale: String(restPose.scale),
            restX: `${restPose.xEm}em`,
            restY: `${restPose.yEm}em`,
            text: unit.text,
          };
          unitIndex += 1;
          return previewUnit;
        }),
      };
    }),
  };
});
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--lyrics"
  >
    <span class="obs-template-mockup__kinetic-stage">
      <strong
        class="obs-template-mockup__kinetic-line"
        :data-kinetic-material="kineticPreviewLine.material"
        :data-kinetic-arrangement="kineticPreviewArrangement"
      >
        <span
          v-for="(row, rowIndex) in kineticPreviewLine.rows"
          :key="`${kineticPreviewLine.material}-row-${rowIndex}`"
          class="obs-template-mockup__kinetic-row"
        >
          <span
            v-for="(unit, unitIndex) in row.units"
            :key="`${kineticPreviewLine.material}-${rowIndex}-${unitIndex}`"
            class="obs-template-mockup__kinetic-unit"
            :data-text="unit.text"
            :style="{
              '--kinetic-unit-delay': unit.delay,
              '--kinetic-rest-x': unit.restX,
              '--kinetic-rest-y': unit.restY,
              '--kinetic-rest-rotation': unit.restRotation,
              '--kinetic-rest-scale': unit.restScale,
            }"
          >
            {{ unit.text }}
          </span>
        </span>
      </strong>
    </span>
  </div>
</template>

<style src="./KineticPopPreview.css"></style>
