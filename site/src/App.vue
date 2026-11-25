<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
  useTemplateRef,
} from 'vue';

import UiScrollRegion from '@app-scroll-region';

import LinkIcon from './components/LinkIcon.vue';
import SiteFooter from './components/SiteFooter.vue';
import { SITE_LINKS } from './content/links.js';
import { MEDIA, ScrollTrigger, useWheelScroll } from './motion.js';
import BeforeAfterSection from './sections/BeforeAfterSection.vue';
import CloseSection from './sections/CloseSection.vue';
import FeatureSection from './sections/FeatureSection.vue';
import HeroSection from './sections/HeroSection.vue';
import IntroSection from './sections/IntroSection.vue';
import PrivacySection from './sections/PrivacySection.vue';
import StagesSection from './sections/StagesSection.vue';
import TemplateMarquee from './sections/TemplateMarquee.vue';

const props = defineProps({ privacy: Boolean });
const scrollRegion = useTemplateRef('scrollRegion');
const downloadRangeActive = shallowRef(false);
const showcaseVisible = shallowRef(false);
const showPill = computed(
  () => downloadRangeActive.value && !showcaseVisible.value,
);
let pillTrigger;
let showcaseTrigger;
let stopWheelScroll;

function moveToSection(section, behavior) {
  section.focus({ preventScroll: true });
  section.scrollIntoView({ behavior });
}

function followSectionLink(event) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    !window.matchMedia(MEDIA.full).matches
  ) {
    return;
  }

  const link = event.target.closest('a[href^="#"]');
  const hash = link?.hash;
  if (!hash || link.target || link.hasAttribute('download')) return;
  const { viewport } = scrollRegion.value;
  const section = document.getElementById(hash.slice(1));
  if (!section || !viewport.contains(section)) return;

  event.preventDefault();
  if (window.location.hash !== hash) {
    // The browser doesn't restore this inner viewport for pushState entries.
    const state = window.history.state;
    window.history.replaceState(
      { ...state, utawakuiScroll: { top: viewport.scrollTop, returnTo: hash } },
      '',
    );
    window.history.pushState(
      { ...state, utawakuiScroll: { sectionId: section.id } },
      '',
      hash,
    );
  }
  moveToSection(section, 'smooth');
}

function restoreSectionPosition({ state }) {
  const saved = state?.utawakuiScroll;
  if (!saved) return;

  if (saved.returnTo) {
    const { viewport } = scrollRegion.value;
    const link = viewport.querySelector(
      `a[href="${CSS.escape(saved.returnTo)}"]`,
    );
    link?.focus({ preventScroll: true });
    viewport.scrollTop = saved.top;
    return;
  }

  const section = document.getElementById(saved.sectionId);
  if (section) moveToSection(section, 'instant');
}

onMounted(() => {
  const { root, viewport: scroller } = scrollRegion.value;
  stopWheelScroll = useWheelScroll(root, scroller);
  window.addEventListener('popstate', restoreSectionPosition);
  if (props.privacy) return;

  function syncShowcase({ isActive }) {
    showcaseVisible.value = isActive;
  }
  showcaseTrigger = ScrollTrigger.create({
    scroller,
    trigger: '.stages__range',
    start: 'top bottom',
    endTrigger: '.wonder',
    end: 'bottom top',
    onToggle: syncShowcase,
    onRefresh: syncShowcase,
  });
  pillTrigger = ScrollTrigger.create({
    scroller,
    trigger: '.hero',
    start: 'bottom top',
    endTrigger: '.product__card',
    end: 'top bottom',
    onToggle: (self) => (downloadRangeActive.value = self.isActive),
  });
  const initialHash = window.location.hash;
  document.fonts.ready.then(() => {
    if (!pillTrigger) return;
    ScrollTrigger.refresh();
    if (initialHash && window.location.hash === initialHash) {
      document
        .getElementById(initialHash.slice(1))
        ?.scrollIntoView({ behavior: 'instant' });
    }
  });
});
onBeforeUnmount(() => {
  stopWheelScroll?.();
  window.removeEventListener('popstate', restoreSectionPosition);
  showcaseTrigger?.kill();
  pillTrigger?.kill();
  pillTrigger = undefined;
});
</script>

<template>
  <UiScrollRegion
    ref="scrollRegion"
    class="site-scroll"
    viewport-class="site-scroll__viewport"
    edge-shadow="none"
    tabindex="0"
    role="region"
    aria-label="Utawakui 網站內容"
    @click="followSectionLink"
  >
    <main v-if="privacy">
      <PrivacySection />
    </main>
    <main v-else>
      <HeroSection />
      <IntroSection />
      <StagesSection />
      <BeforeAfterSection />
      <TemplateMarquee />
      <FeatureSection />
      <CloseSection />
    </main>
    <SiteFooter :privacy="privacy" />
  </UiScrollRegion>
  <Transition name="download-pill">
    <a
      v-if="showPill"
      class="pill btn btn--primary"
      :href="SITE_LINKS.download"
    >
      <LinkIcon name="download" />
      下載 Windows 版
    </a>
  </Transition>
</template>

<style scoped>
.site-scroll {
  block-size: var(--site-viewport-height);
}

.pill {
  position: fixed;
  inset-inline-end: max(var(--ui-space-5), env(safe-area-inset-right));
  inset-block-end: max(var(--ui-space-5), env(safe-area-inset-bottom));
  z-index: var(--ui-layer-raised);
}

@media (prefers-reduced-motion: no-preference) {
  .download-pill-enter-active {
    transition:
      opacity var(--ui-motion-duration-standard)
        var(--ui-motion-easing-standard),
      transform var(--ui-motion-duration-standard)
        var(--ui-motion-easing-standard);
  }

  .download-pill-enter-from {
    opacity: 0;
    transform: translateY(var(--ui-space-4));
  }
}

@media (max-width: 759.98px) {
  .pill {
    padding-inline: var(--ui-space-5);
    font-size: var(--ui-type-body-size);
  }
}
</style>
