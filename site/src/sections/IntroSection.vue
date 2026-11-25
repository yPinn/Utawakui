<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

import BrandStage from '../components/BrandStage.vue';
import { gsap, reveal, useSectionMotion } from '../motion.js';

const root = ref(null);
let cleanup;
onMounted(() => {
  cleanup = useSectionMotion(root.value, (scroller) => {
    reveal(scroller, gsap.utils.selector(root.value)('.intro__copy > *'), {
      stagger: 0.12,
    });
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <section ref="root" class="chapter intro" aria-labelledby="intro-title">
    <BrandStage />
    <div class="intro__shade" aria-hidden="true" />
    <div class="intro__copy">
      <h2 id="intro-title" class="display display--lead">
        <span class="intro__plate">用自己的歌曲開始</span>
      </h2>
      <p class="type-body">
        匯入電腦裡的音檔，為下一次練唱或直播排好歌單、備好歌詞。
      </p>
    </div>
  </section>
</template>

<style scoped>
.intro {
  height: max(48rem, 100vh);
  overflow: hidden;
  background: var(--site-ground-dark);
}

.intro__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 30%,
    color-mix(in srgb, var(--site-ground-dark) 78%, transparent)
  );
}

.intro__copy {
  position: absolute;
  inset: auto 6vw var(--ui-space-7);
  display: grid;
  gap: var(--ui-space-4);
  justify-items: start;
  color: var(--ui-color-chrome-text);
}

/* Paper plate behind the headline, one more sheet on the stage. */
.intro__plate {
  display: inline-block;
  padding: var(--ui-space-2) var(--ui-space-5);
  border-radius: var(--site-radius);
  background: var(--site-paper);
  box-shadow: var(--site-shadow);
  color: var(--site-text);
}

.intro__copy p {
  max-width: 30em;
  padding: var(--ui-space-2) var(--ui-space-4);
  border-radius: var(--site-radius);
  background: var(--site-ground-dark);
}

@media (max-width: 759.98px) {
  .intro {
    height: 80svh;
  }
}
</style>
