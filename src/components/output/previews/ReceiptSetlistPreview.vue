<script setup>
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import gsap from 'gsap';
import { createReceiptView } from '../../../../overlay/setlist/receiptView.mjs';
import { selectReceiptSetlistFrame } from '../../../../shared/presentation/receiptSetlist.mjs';

const props = defineProps({
  scene: { type: Object, default: () => ({}) },
  size: { type: String, default: 'detail' },
  animated: { type: Boolean, default: false },
});
const host = useTemplateRef('receiptHost');
let view = null;
let media = null;
let previewActive = null;
function reducedMotion() {
  view?.setReducedMotion(media?.matches === true);
}
function update() {
  if (!view) return;
  view.configure(props.scene.appearance ?? {});
  if (previewActive !== props.animated) {
    previewActive = props.animated;
    view.setActive(previewActive);
  }
  view.update(selectReceiptSetlistFrame(props.scene.snapshot), {
    settle: !props.animated,
  });
}
onMounted(() => {
  view = createReceiptView(host.value, { gsap });
  view.setVisible(true);
  media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', reducedMotion);
  reducedMotion();
  update();
});
watch([() => props.scene, () => props.animated], update);
onBeforeUnmount(() => {
  media?.removeEventListener('change', reducedMotion);
  view?.destroy();
});
</script>

<template>
  <div ref="receiptHost" class="receipt-container" />
</template>

<style src="../../../../overlay/setlist/receipt.css"></style>
