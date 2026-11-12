<script setup>
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { RIBBON_PREVIEW_REVIEW_INTERVAL_MS } from '../../../../overlay/setlist/ribbonFlashback.mjs';
import { createRibbonView } from '../../../../overlay/setlist/ribbonView.mjs';
import { selectReceiptSetlistFrame } from '../../../../shared/presentation/receiptSetlist.mjs';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});
const host = useTemplateRef('host');
let view;
let motionPreference;

function syncReducedMotion() {
  view?.setReducedMotion(motionPreference.matches);
}

function update() {
  view?.configure(props.scene.appearance);
  view?.update(
    props.scene.frame ?? selectReceiptSetlistFrame(props.scene.snapshot),
  );
  view?.setActive(props.animated, { reveal: true });
}

onMounted(() => {
  view = createRibbonView(host.value, {
    reviewInterval: RIBBON_PREVIEW_REVIEW_INTERVAL_MS,
  });
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionPreference.addEventListener('change', syncReducedMotion);
  syncReducedMotion();
  view.setVisible(true);
  update();
});
watch([() => props.scene, () => props.animated], update);
onBeforeUnmount(() => {
  motionPreference?.removeEventListener('change', syncReducedMotion);
  view?.destroy();
});
</script>

<template>
  <div ref="host" class="ribbon-host" />
</template>

<style src="../../../../overlay/shared/fallback.css"></style>
<style src="../../../../overlay/shared/tokens.css"></style>
<style src="../../../../overlay/setlist/ribbon.css"></style>
