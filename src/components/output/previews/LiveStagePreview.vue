<script setup>
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import gsap from 'gsap';
import {
  adaptLiveStageLyricsPresentation,
  analyzeLyricsSource,
} from '../../../../shared/presentation/lyricsPresentation.mjs';
import {
  animateLiveStageCaption,
  renderLiveStageCard,
} from '../../../../overlay/lyrics/liveStage.mjs';
import { useOutputPreviewMotion } from '../../../composables/output/useOutputPreviewMotion.js';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});

const track = computed(() => props.scene?.track ?? {});
const lyrics = computed(() => props.scene?.lyrics ?? {});
const root = useTemplateRef('root');
const card = useTemplateRef('card');
const caption = useTemplateRef('caption');
const showingNext = shallowRef(false);
let captionMotion;
const liveStageLines = computed(
  () =>
    adaptLiveStageLyricsPresentation(
      analyzeLyricsSource(
        showingNext.value ? lyrics.value.next : lyrics.value.current,
      ),
      { lyricsPresentationPolicyId: props.scene?.lyricsPresentationPolicyId },
    ).lines,
);

function showCard(visible, reducedMotion = false) {
  renderLiveStageCard(
    { root: root.value, liveStageCard: card.value },
    { active: true, cardVisible: visible },
    { gsap, reducedMotion },
  );
}

function animateCaption() {
  captionMotion?.cancel();
  captionMotion = animateLiveStageCaption(
    caption.value,
    props.scene.frame?.lyricsRhythm,
  );
}

let playing = false;
watch(
  showingNext,
  () => {
    if (playing) animateCaption();
  },
  { flush: 'post' },
);

useOutputPreviewMotion({
  scene: () => props.scene,
  animated: () => props.animated,
  start() {
    showCard(false, true);
    playing = true;
    animateCaption();
    const timeline = gsap.timeline({ paused: true, repeat: -1 });
    timeline.call(
      () => {
        showingNext.value = false;
      },
      [],
      0,
    );
    timeline.call(() => showCard(true), [], 0.45);
    timeline.call(
      () => {
        if (lyrics.value.next) showingNext.value = true;
      },
      [],
      1.8,
    );
    timeline.call(() => showCard(false), [], 2.65);
    timeline.addLabel('repeat', 3.6);
    timeline.call(
      () => {
        showingNext.value = false;
      },
      [],
      'repeat',
    );
    timeline.play();
    return () => timeline.kill();
  },
  stop() {
    playing = false;
    captionMotion?.cancel();
    captionMotion = undefined;
    showingNext.value = false;
    showCard(props.scene.frame?.liveStage?.cardVisible ?? true, true);
  },
});
</script>

<template>
  <div
    ref="root"
    class="obs-template-mockup__content obs-template-mockup__content--lyrics"
  >
    <span class="obs-template-mockup__live-stage-brand">
      <strong>U</strong>
      <span class="obs-template-mockup__live-stage-brand-copy">
        <span>UTAWAKUI</span>
        <strong>LIVE STAGE</strong>
      </span>
    </span>
    <strong class="obs-template-mockup__live-stage-channel">UW</strong>
    <strong ref="caption" class="obs-template-mockup__live-stage-caption">
      <span v-for="line in liveStageLines" :key="line">{{ line }}</span>
    </strong>
    <span
      ref="card"
      :hidden="!(scene.frame?.liveStage?.cardVisible ?? true)"
      class="obs-template-mockup__live-stage-card"
    >
      <span class="obs-template-mockup__live-stage-card-mark">
        <strong>U</strong>
        <span>LIVE</span>
      </span>
      <span class="obs-template-mockup__live-stage-card-copy">
        <strong>{{ track.title }}</strong>
        <span>{{ track.artist }}</span>
      </span>
    </span>
  </div>
</template>

<style src="./LiveStagePreview.css"></style>
