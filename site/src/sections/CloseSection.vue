<script setup>
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';

import appIcon from '@icons/app-icon.png';

import LinkIcon from '../components/LinkIcon.vue';
import WaveEdge from '../components/WaveEdge.vue';
import { SITE_LINKS, WINDOWS_REQUIREMENT } from '../content/links.js';
import { gsap, reveal, useSectionMotion } from '../motion.js';

const faqs = [
  {
    q: '我的電腦可以安裝嗎？',
    a: `可安裝在 ${WINDOWS_REQUIREMENT}的電腦上。`,
  },
  {
    q: 'Windows 顯示「未知的發行者」，怎麼辦？',
    a: '公開測試版安裝時可能出現這項提示。請從官方發行頁下載。如果你想確認檔案是否完整，可以比對同一頁的 SHA256SUMS.txt。',
    links: [{ label: '官方發行頁', href: SITE_LINKS.releases }],
  },
  {
    q: '有新版時怎麼更新？',
    a: '程式會在有新版時提示，由你決定何時下載和安裝。你也可以在設定裡關閉更新檢查。',
  },
  {
    q: '有附歌曲嗎？',
    a: 'Utawakui 沒有內建曲庫。請匯入你有權使用的音檔。',
  },
  {
    q: '需要搭配哪一套直播軟體？',
    a: '整理歌曲、播放和練唱都可在 Utawakui 裡完成。用於直播時，可用你習慣的軟體。先確認它能透過網址新增「瀏覽器來源」，再預覽曲名和歌詞的顯示效果。',
    links: [{ label: '看畫面輸出步驟', href: '#output-setup' }],
  },
  {
    q: '可以用在營利直播或錄影嗎？',
    a: '可以。Utawakui 可免費用於營利直播與錄影。請自行確認歌曲、伴奏、歌詞和封面能否用於你的直播、錄影或回放。',
  },
  {
    q: '我的歌曲和歌詞存在哪裡？',
    a: '歌曲、歌詞、歌單和設定主要留在你的電腦。查詢線上歌詞、檢查更新等功能會使用網路。',
    links: [{ label: '網站隱私說明', href: SITE_LINKS.privacy }],
  },
  {
    q: '遇到問題可以去哪裡回報？',
    a: '一般問題或建議可以到 Discord 交流。涉及安全或隱私的問題，請使用 GitHub 私密回報。',
    links: [
      { label: 'Discord 社群', href: SITE_LINKS.discord, icon: 'discord' },
      { label: 'GitHub 私密回報', href: SITE_LINKS.security, icon: 'github' },
    ],
  },
];

const root = useTemplateRef('root');
let cleanup;
onMounted(() => {
  cleanup = useSectionMotion(root.value, (scroller) => {
    const targets = gsap.utils.selector(root.value)('.product__card, .faq');
    reveal(scroller, targets, { autoAlpha: 1, y: 16 });
  });
});
onBeforeUnmount(() => cleanup?.());
</script>

<template>
  <section
    ref="root"
    class="chapter chapter--wave product texture-paper"
    aria-labelledby="product-title"
  >
    <WaveEdge
      color="var(--site-ground-canvas)"
      background="var(--site-ground-surface)"
    />
    <div class="product__card">
      <img :src="appIcon" alt="" width="112" height="112" />
      <div class="product__info">
        <h2 id="product-title" class="display display--lead">下載 Utawakui</h2>
        <p class="type-body">{{ WINDOWS_REQUIREMENT }}・免費公開測試版</p>
        <div class="product__actions">
          <a class="btn btn--secondary" :href="SITE_LINKS.releases">
            <LinkIcon name="github" /> 版本說明
          </a>
          <a class="btn btn--primary" :href="SITE_LINKS.download">
            <LinkIcon name="download" /> 下載 Windows 版
          </a>
        </div>
      </div>
    </div>

    <section class="faq" aria-labelledby="faq-title">
      <h2 id="faq-title" class="display display--lead">常見問題</h2>
      <details v-for="f in faqs" :key="f.q" name="faq">
        <summary class="type-title">{{ f.q }}</summary>
        <div class="faq__answer">
          <p class="type-body">{{ f.a }}</p>
          <ul v-if="f.links" class="faq__links">
            <li v-for="link in f.links" :key="link.href">
              <a :href="link.href">
                <LinkIcon v-if="link.icon" :name="link.icon" />{{ link.label }}
              </a>
            </li>
          </ul>
        </div>
      </details>
    </section>
  </section>
</template>

<style scoped>
.product {
  --chapter-top-gap: var(--ui-space-6);
  display: grid;
  gap: var(--ui-space-8);
  justify-items: center;
  padding-inline: 6vw;
  padding-block-end: calc(var(--ui-space-8) * 1.5);
  background-color: var(--site-ground-canvas);
}

.product__card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-6);
  width: var(--content-width);
  padding: clamp(var(--ui-space-5), 4vw, var(--ui-space-7));
  border: var(--site-border-line);
  border-radius: var(--site-radius);
  background: var(--site-paper);
  box-shadow: var(--site-shadow);
}

.product__card img {
  border-radius: var(--ui-radius-lg);
}

.product__info {
  display: grid;
  gap: var(--ui-space-3);
}

.product__info p {
  color: var(--site-text-muted);
}

.product__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-2);
}

.faq {
  display: grid;
  gap: var(--ui-space-3);
  width: min(46rem, var(--content-width));
}

.faq h2 {
  margin-bottom: var(--ui-space-2);
  text-align: center;
}

.faq details {
  border: var(--site-border-line);
  border-radius: var(--site-radius);
  background: var(--site-paper);
}

.faq summary {
  padding: var(--ui-space-4) var(--ui-space-5);
  cursor: pointer;
}

.faq__answer {
  display: grid;
  gap: var(--ui-space-2);
  padding: 0 var(--ui-space-5) var(--ui-space-4);
}

.faq__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}

.faq__links a {
  display: inline-flex;
  min-block-size: calc(var(--ui-space-6) + var(--ui-space-3));
  align-items: center;
  gap: var(--ui-space-2);
}
</style>
