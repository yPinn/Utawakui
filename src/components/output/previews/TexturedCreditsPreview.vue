<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
} from 'vue';
import gsap from 'gsap';
import { outputFontFamilyCss } from '../../../../shared/outputAppearance.mjs';
import {
  releaseTexturedCredits,
  renderTexturedCredits,
} from '../../../../overlay/lyrics/texturedCredits.mjs';
import '../../../../overlay/lyrics/texturedCredits.css';
import { useOutputPreviewMotion } from '../../../composables/output/useOutputPreviewMotion.js';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  animated: { type: Boolean, default: false },
});

const stage = useTemplateRef('stage');
// PixiJS loads as its own chunk; the preview shows text until it is ready.
const effectRuntime = shallowRef(null);
let unmounted = false;
onMounted(async () => {
  try {
    const [pixi, pixiFilters] = await Promise.all([
      import('pixi.js'),
      import('pixi-filters'),
      import('pixi.js/unsafe-eval'),
    ]);
    if (!unmounted) effectRuntime.value = { pixi, pixiFilters };
  } catch {
    // Without the effect runtime the preview keeps the text-only fallback.
  }
});
const durationMs = 2200;
const fontStyle = computed(() => ({
  '--credits-font': outputFontFamilyCss(
    props.scene.appearance?.fontFamily,
    'textured-credits',
  ),
  '--credits-scale':
    { small: 0.85, large: 1.2 }[props.scene.appearance?.fontScale] ?? 1,
}));

function render(playing = false, next = false, looped = false) {
  const { frame, lyrics } = props.scene;
  const firstText = frame?.currentText ?? lyrics?.current;
  const currentText = next ? lyrics?.next : firstText;
  const previousText = next ? firstText : looped ? lyrics?.next : '';
  renderTexturedCredits(
    stage.value,
    {
      visible: Boolean(currentText),
      currentText,
      language: frame?.language ?? lyrics?.language,
      lineIndex: (frame?.lineIndex ?? 0) + Number(next),
      texturedCreditsTiming: {
        durationMs,
        ageMs: playing ? 0 : 820,
        playing,
        rate: 1,
        continuesIntoNext: playing && Boolean(firstText && lyrics?.next),
        previous: previousText
          ? {
              text: previousText,
            }
          : undefined,
      },
    },
    { gsap, ...effectRuntime.value },
  );
}

useOutputPreviewMotion({
  scene: () => [props.scene, effectRuntime.value],
  animated: () => props.animated,
  start() {
    render(true);
    const nextAt = durationMs / 1000;
    const timeline = gsap.timeline({ repeat: -1 });
    timeline.call(
      () => render(true, Boolean(props.scene.lyrics?.next)),
      [],
      nextAt,
    );
    timeline.call(() => render(true, false, true), [], nextAt * 2);
    return () => timeline.kill();
  },
  stop: () => render(),
});

onBeforeUnmount(() => {
  unmounted = true;
  releaseTexturedCredits(stage.value);
});
</script>

<template>
  <div
    ref="stage"
    class="textured-credits"
    :data-alignment="scene.appearance?.alignment"
    :lang="scene.lyrics?.language"
    :style="fontStyle"
    hidden
  ></div>
</template>

<style>
@font-face {
  font-family: 'Utawakui Hina Mincho';
  src: url('../../../../shared/assets/fonts/HinaMincho-Regular.ttf')
    format('truetype');
  font-display: swap;
  font-style: normal;
  font-weight: 400;
}
</style>
