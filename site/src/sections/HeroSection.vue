<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

import LinkIcon from '../components/LinkIcon.vue';
import { SITE_LINKS, WINDOWS_REQUIREMENT } from '../content/links.js';
import {
  DURATION_SLOW,
  EASE_ENTER,
  gsap,
  useSectionMotion,
} from '../motion.js';

const root = ref(null);
// Folder-material tabs drifting around the wordmark: position, rotation, material.
const tabs = [
  { x: '7%', y: '20%', r: -8, label: '曲庫', m: 'primary' },
  { x: '14%', y: '66%', r: 6, label: '歌詞', m: 'tertiary' },
  { x: '78%', y: '16%', r: 5, label: '歌單', m: 'secondary' },
  { x: '84%', y: '60%', r: -6, label: '直播', m: 'primary' },
  { x: '66%', y: '80%', r: 4, label: '練唱', m: 'tertiary' },
];

let cleanup;
onMounted(() => {
  cleanup = useSectionMotion(root.value, () => {
    const q = gsap.utils.selector(root.value);
    gsap
      .timeline({
        delay: 0.15,
        defaults: { ease: EASE_ENTER, duration: DURATION_SLOW * 2 },
      })
      .from(q('.hero__logo'), { autoAlpha: 0, y: 32 })
      .from(
        q('.hero__kicker, .hero__lead'),
        { autoAlpha: 0, y: 16, stagger: 0.08 },
        '-=0.35',
      )
      .from(q('.hero__release'), { autoAlpha: 0, y: 16 }, '-=0.3')
      .from(q('.tab'), { autoAlpha: 0, y: 24, stagger: 0.05 }, 0.2);
    q('.tab').forEach((el, i) => {
      gsap.to(el, {
        y: -10,
        duration: 3 + i * 0.4,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    });
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <section
    ref="root"
    class="chapter hero texture-paper"
    aria-labelledby="hero-title"
  >
    <span
      v-for="(t, i) in tabs"
      :key="i"
      class="tab"
      :class="`tab--${t.m}`"
      :style="{ '--tab-x': t.x, '--tab-y': t.y, '--r': `${t.r}deg` }"
      aria-hidden="true"
      >{{ t.label }}</span
    >
    <div class="hero__center">
      <p class="hero__kicker type-title">
        <span class="marker">歌唱直播與翻唱工具</span>
      </p>
      <h1 id="hero-title" class="hero__logo display display--hero">Utawakui</h1>
      <p class="hero__lead type-title">
        整理歌曲、看歌詞練唱，也能把曲名與歌詞放進直播畫面。
      </p>
      <div class="hero__release">
        <a class="btn btn--primary" :href="SITE_LINKS.download">
          <LinkIcon name="download" /> 下載 Windows 版
        </a>
        <p class="type-caption">{{ WINDOWS_REQUIREMENT }}・免費公開測試版</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero {
  display: grid;
  place-items: center;
  min-height: 100svh;
  padding: var(--ui-space-8) 6vw;
  overflow: hidden;
  background-color: var(--site-ground-canvas);
}

/* Folder tabs: material plate with the folder foreground, like the app's folder tab. */
.tab {
  position: absolute;
  inset-inline-start: var(--tab-x);
  inset-block-start: var(--tab-y);
  padding: var(--ui-space-2) var(--ui-space-5);
  border-radius: var(--site-radius) var(--site-radius) 0 0;
  box-shadow: var(--site-shadow-soft);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-font-weight-semibold);
  transform: rotate(var(--r));
}

.tab--primary {
  background: var(--ui-color-folder-primary);
  color: var(--ui-color-folder-primary-foreground);
}

.tab--secondary {
  background: var(--ui-color-folder-secondary);
  color: var(--ui-color-folder-secondary-foreground);
}

.tab--tertiary {
  background: var(--ui-color-folder-tertiary);
  color: var(--ui-color-folder-tertiary-foreground);
}

.hero__center {
  position: relative;
  display: grid;
  gap: var(--ui-space-5);
  justify-items: center;
  text-align: center;
}

.hero__logo {
  color: var(--site-text);
}

.hero__lead {
  max-width: 28em;
  line-height: var(--site-line-reading);
  text-wrap: balance;
}

.hero__release {
  display: grid;
  gap: var(--ui-space-3);
  justify-items: center;
  color: var(--site-text-muted);
}

@media (max-width: 759.98px) {
  .tab--secondary {
    inset-inline: auto var(--ui-space-5);
  }

  .tab:nth-of-type(2),
  .tab:nth-of-type(n + 4) {
    display: none;
  }
}
</style>
