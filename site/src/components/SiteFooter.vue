<script setup>
import { SITE_LINKS } from '../content/links.js';
import LinkIcon from './LinkIcon.vue';

defineProps({ privacy: Boolean });
</script>

<template>
  <footer class="footer">
    <a class="footer__name type-heading" href="/">Utawakui</a>
    <nav class="footer__nav type-body" aria-label="社群與版本">
      <a :href="SITE_LINKS.discord"><LinkIcon name="discord" /> Discord 社群</a>
      <a :href="SITE_LINKS.github"><LinkIcon name="github" /> GitHub 發行頁</a>
    </nav>
    <nav class="footer__nav type-caption" aria-label="授權與隱私">
      <a :href="SITE_LINKS.license">軟體授權</a>
      <a
        :href="SITE_LINKS.privacy"
        :aria-current="privacy ? 'page' : undefined"
      >
        網站隱私
      </a>
      <a :href="SITE_LINKS.security">安全性回報</a>
    </nav>
  </footer>
</template>

<style scoped>
.footer {
  display: grid;
  gap: var(--ui-space-3);
  justify-items: center;
  padding: var(--ui-space-7) 6vw;
  background-color: var(--site-ground-dark);
  color: var(--ui-color-chrome-text);
  text-align: center;
}

.footer__name {
  text-decoration: none;
}

.footer__nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  column-gap: var(--ui-space-5);
}

.footer__nav a {
  display: inline-flex;
  min-block-size: calc(var(--ui-space-6) + var(--ui-space-3));
  align-items: center;
  gap: var(--ui-space-2);
  text-underline-offset: 0.2em;
}

.footer__nav a[aria-current='page'] {
  font-weight: var(--ui-font-weight-semibold);
}
</style>
