<script setup>
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import gsap from 'gsap';
import {
  createFisheyeMotion,
  FISHEYE_LAYOUT_DURATION_MS,
} from '../../../../shared/browser/fisheyeMotion.mjs';
import {
  createFisheyePainter,
  FISHEYE_HEIGHT,
  FISHEYE_WIDTH,
} from '../../../../shared/browser/fisheyePaint.mjs';
import {
  fisheyeLyricsColumns,
  resolveFisheyeExit,
  resolveFisheyeLayout,
} from '../../../../shared/presentation/fisheyeLyrics.mjs';

const props = defineProps({
  scene: { type: Object, required: true },
  animated: { type: Boolean, default: false },
});
const canvas = useTemplateRef('canvas');
let painter;
let motion;
let animation;

function stop() {
  if (animation !== undefined) cancelAnimationFrame(animation);
  animation = undefined;
}

function update() {
  if (!painter) return;
  stop();
  const columns = fisheyeLyricsColumns(
    props.scene.frame?.currentText ?? props.scene.lyrics?.current,
  );
  const appearance = props.scene.appearance;
  const lensLayout = resolveFisheyeLayout(
    appearance?.fisheyeLayout,
    props.scene.frame?.fisheyeVariant,
  );
  const still =
    !props.animated || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) {
    painter.render(columns, { reducedMotion: true, lensLayout }, appearance);
    return;
  }
  const started = performance.now();
  function paint(now) {
    const durationMs = 2200;
    const elapsedMs = now - started;
    const ageMs = elapsedMs % durationMs;
    const cameraMs = elapsedMs % (2 * durationMs);
    const target = cameraMs >= durationMs ? 1 : 0;
    const pose = motion.lyricPose({
      ageMs,
      durationMs,
      animate: true,
      enter: appearance?.fisheyeEnter,
      exit: resolveFisheyeExit(
        appearance?.fisheyeExit,
        target ? 'chorus' : 'base',
      ),
      blur: appearance?.fisheyeBlur === 'on',
    });
    const layoutMix =
      !appearance?.fisheyeLayout || appearance.fisheyeLayout === 'auto'
        ? elapsedMs < durationMs
          ? 0
          : motion.layoutMix({
              target,
              elapsedMs: cameraMs % durationMs,
              durationMs: target
                ? FISHEYE_LAYOUT_DURATION_MS.push
                : FISHEYE_LAYOUT_DURATION_MS.pull,
            })
        : Number(lensLayout === 'close');
    painter.render(
      columns,
      {
        ...pose,
        layoutMix,
        reflectionPositionMs: now - started + 720,
      },
      appearance,
    );
    animation = requestAnimationFrame(paint);
  }
  animation = requestAnimationFrame(paint);
}

onMounted(() => {
  painter = createFisheyePainter(canvas.value);
  motion = createFisheyeMotion(gsap);
  update();
});
watch(() => [props.scene, props.animated], update);
onBeforeUnmount(() => {
  stop();
  motion?.dispose();
});
</script>

<template>
  <canvas
    ref="canvas"
    class="fisheye-lens-preview"
    :width="FISHEYE_WIDTH"
    :height="FISHEYE_HEIGHT"
    aria-hidden="true"
  />
</template>

<style scoped>
.fisheye-lens-preview {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
