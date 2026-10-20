<script setup>
import { computed } from 'vue';
import {
  adaptKtvLyricsPresentation,
  analyzeLyricsSource,
  parseKtvDisplayPhrases,
} from '../../../../shared/presentation/lyricsPresentation.mjs';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const lyrics = computed(() => props.scene?.lyrics ?? {});
const lyricsSourceAnalysis = computed(() =>
  analyzeLyricsSource(lyrics.value.current),
);
const ktvCurrentSource = computed(() =>
  adaptKtvLyricsPresentation(lyricsSourceAnalysis.value, {
    language: lyrics.value.language,
  }),
);
const ktvNextAnalysis = computed(() => analyzeLyricsSource(lyrics.value.next));
const ktvNextSource = computed(() =>
  adaptKtvLyricsPresentation(ktvNextAnalysis.value, {
    language: lyrics.value.language,
  }),
);
const ktvDisplayPhrases = computed(() => [
  ...parseKtvDisplayPhrases(lyricsSourceAnalysis.value, {
    language: lyrics.value.language,
  }).map((phrase) => ({ ...phrase, role: ktvCurrentSource.value.role })),
  ...parseKtvDisplayPhrases(ktvNextAnalysis.value, {
    language: lyrics.value.language,
  }).map((phrase) => ({ ...phrase, role: ktvNextSource.value.role })),
]);
const ktvCurrent = computed(
  () =>
    (props.scene?.frame?.ktv
      ? {
          text: props.scene.frame.ktv.currentText,
          role: props.scene.frame.ktv.currentRole,
        }
      : null) ??
    ktvDisplayPhrases.value[0] ?? {
      text: ktvCurrentSource.value.text,
      role: ktvCurrentSource.value.role,
    },
);
const ktvNext = computed(
  () =>
    (props.scene?.frame?.ktv
      ? {
          text: props.scene.frame.ktv.nextText,
          role: props.scene.frame.ktv.nextRole,
        }
      : null) ??
    ktvDisplayPhrases.value[1] ?? {
      text: ktvNextSource.value.text,
      role: ktvNextSource.value.role,
    },
);
</script>

<template>
  <div
    class="obs-template-mockup__content obs-template-mockup__content--lyrics"
  >
    <span class="obs-template-mockup__ktv-lines">
      <span
        v-if="!scene.frame?.ktv || scene.frame.ktv.countIn"
        class="obs-template-mockup__ktv-count-in"
        :data-ktv-role="ktvCurrent.role"
        aria-hidden="true"
      >
        <span class="obs-template-mockup__ktv-count-in-dot" />
        <span class="obs-template-mockup__ktv-count-in-dot" />
        <span class="obs-template-mockup__ktv-count-in-dot" />
        <span class="obs-template-mockup__ktv-count-in-dot" />
      </span>
      <strong
        class="obs-template-mockup__ktv-line"
        :data-ktv-lane="
          scene.frame?.ktv
            ? scene.frame.ktv.currentLaneIndex % 2 === 0
              ? 'a'
              : 'b'
            : 'a'
        "
        :data-ktv-role="ktvCurrent.role"
      >
        <span class="obs-template-mockup__ktv-line-base">
          {{ ktvCurrent.text }}
        </span>
        <span class="obs-template-mockup__ktv-line-fill" aria-hidden="true">
          {{ ktvCurrent.text }}
        </span>
      </strong>
      <strong
        class="obs-template-mockup__ktv-line"
        :data-ktv-held="
          scene.frame?.ktv ? String(scene.frame.ktv.nextHeld) : 'true'
        "
        :data-ktv-lane="
          scene.frame?.ktv
            ? scene.frame.ktv.nextLaneIndex % 2 === 0
              ? 'a'
              : 'b'
            : 'b'
        "
        :data-ktv-role="ktvNext.role"
      >
        {{ ktvNext.text }}
      </strong>
    </span>
  </div>
</template>

<style src="./KaraokeStackPreview.css"></style>
