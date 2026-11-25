<script setup>
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

import WaveEdge from '../components/WaveEdge.vue';
import { SITE_LINKS } from '../content/links.js';
import { gsap, reveal, useSectionMotion } from '../motion.js';

const steps = [
  { n: 1, text: '在 Utawakui 設定中啟用「對外輸出」。' },
  { n: 2, text: '到「畫面輸出」選擇要顯示的內容，複製它的網址。' },
  { n: 3, text: '在直播軟體新增瀏覽器來源，貼上網址。' },
];

const root = useTemplateRef('root');
let cleanup;
onMounted(() => {
  cleanup = useSectionMotion(root.value, (scroller) => {
    const q = gsap.utils.selector(root.value);
    reveal(scroller, q('#feature-title, .step'), {
      autoAlpha: 1,
      stagger: 0.12,
    });
    const [left, right] = q('.col');
    reveal(scroller, [left], { autoAlpha: 1, x: -48, y: 0 });
    reveal(scroller, [right], { autoAlpha: 1, x: 48, y: 0 });
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <section
    ref="root"
    class="chapter chapter--wave feature texture-paper"
    aria-labelledby="feature-title"
  >
    <WaveEdge
      color="var(--site-ground-surface)"
      background="var(--site-ground-secondary)"
    />
    <div class="feature__inner">
      <article
        id="output-setup"
        class="feature__main"
        aria-labelledby="feature-title"
        tabindex="-1"
      >
        <h2 id="feature-title" class="display display--lead">
          把歌詞放進直播畫面
        </h2>
        <p class="type-body">
          先確認你的直播軟體有「瀏覽器來源」，能用網址把網頁加到直播畫面。
        </p>
        <ol class="steps" role="list">
          <li v-for="s in steps" :key="s.n" class="step type-body">
            <span class="step__n type-heading" aria-hidden="true">{{
              s.n
            }}</span>
            {{ s.text }}
          </li>
        </ol>
        <a class="feature__help" :href="SITE_LINKS.obsBrowserSourceGuide"
          >OBS Studio 設定範例（英文）</a
        >
      </article>

      <div class="cols">
        <article class="col">
          <h3 class="type-heading">分開伴奏和人聲</h3>
          <p class="type-body">
            可在電腦上從音檔分出伴奏和人聲，搭配導唱練習。第一次使用時需準備處理工具，時間與效果會受音檔和電腦影響。
          </p>
        </article>
        <article class="col">
          <h3 class="type-heading">匯入或搜尋歌詞</h3>
          <p class="type-body">
            手上的歌詞可以直接匯入和編輯。需要找歌詞時，可以另外開啟線上搜尋。
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.feature {
  --chapter-top-gap: var(--ui-space-6);
  padding-block-end: var(--ui-space-8);
  background-color: var(--site-ground-surface);
}

.feature__inner {
  display: grid;
  gap: var(--ui-space-8);
  width: var(--content-width);
  margin: 0 auto;
}

.feature__main,
.col {
  border: var(--site-border-line);
  border-radius: var(--site-radius);
  background: var(--site-paper);
  box-shadow: var(--site-shadow-soft);
}

.feature__main {
  display: grid;
  gap: var(--ui-space-6);
  padding: clamp(var(--ui-space-5), 4vw, var(--ui-space-7));
}

.feature__help {
  justify-self: start;
  text-underline-offset: 0.2em;
}

/* Three steps joined by arrows; the flow itself is the unit's visual. */
.steps {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-7);
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  position: relative;
  display: grid;
  gap: var(--ui-space-3);
  justify-items: start;
  padding: var(--ui-space-5);
  border-radius: var(--site-radius);
  background: var(--ui-color-accent-soft);
}

.step:not(:last-child)::after {
  content: '→';
  position: absolute;
  top: 50%;
  left: 100%;
  width: var(--ui-space-7);
  color: var(--site-accent);
  font-size: var(--ui-font-size-xl);
  text-align: center;
  transform: translateY(-50%);
}

.step__n {
  color: var(--site-accent);
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-6);
}

.col {
  display: grid;
  align-content: start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-6);
}

@media (max-width: 759.98px) {
  .steps,
  .cols {
    grid-template-columns: 1fr;
  }

  /* Stacked steps point downward. */
  .step:not(:last-child)::after {
    content: '↓';
    top: 100%;
    left: 50%;
    width: auto;
    height: var(--ui-space-7);
    line-height: var(--ui-space-7);
    transform: translateX(-50%);
  }
}
</style>
