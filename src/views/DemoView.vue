<script setup>
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import DemoActions from '../components/demo/DemoActions.vue';
import DemoContent from '../components/demo/DemoContent.vue';
import DemoFeedback from '../components/demo/DemoFeedback.vue';
import DemoFoundations from '../components/demo/DemoFoundations.vue';
import DemoInputs from '../components/demo/DemoInputs.vue';
import DemoNavigation from '../components/demo/DemoNavigation.vue';
import DemoOverlays from '../components/demo/DemoOverlays.vue';
import UiScrollRegion from '../components/ui/UiScrollRegion.vue';
import {
  UI_DEMO_ADOPTED_SECTION_KEYS,
  UI_DEMO_GROUP_REVIEW_STATUS,
  UI_DEMO_GROUPS,
} from '../constants/uiDemoSections.js';
import '../styles/tokens-v2.css';

const GROUP_COMPONENTS = {
  foundations: DemoFoundations,
  inputs: DemoInputs,
  actions: DemoActions,
  navigation: DemoNavigation,
  feedback: DemoFeedback,
  content: DemoContent,
  overlays: DemoOverlays,
};

const GROUP_REVIEW_LABELS = Object.freeze({
  reviewed: '已審查',
  partial: '部分完成',
  pending: '待審查',
});

let previousUiSystem;
const scrollRegion = useTemplateRef('scrollRegion');

onMounted(() => {
  const root = document.documentElement;
  previousUiSystem = root.dataset.uiSystem;
  root.dataset.uiSystem = 'v2';
});

onUnmounted(() => {
  const root = document.documentElement;
  if (previousUiSystem) root.dataset.uiSystem = previousUiSystem;
  else delete root.dataset.uiSystem;
});

function scrollToGroup(key) {
  const target = document.getElementById(`demo-group-${key}`);
  const scrollContainer = scrollRegion.value?.viewport;
  if (!target || !scrollContainer) return;

  const targetRect = target.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  scrollContainer.scrollTo({
    top: scrollContainer.scrollTop + targetRect.top - containerRect.top,
    behavior: 'auto',
  });
}
</script>

<template>
  <section class="demo-view" aria-labelledby="demo-catalogue-title">
    <header class="demo-view__header">
      <div class="demo-view__intro">
        <h1 id="demo-catalogue-title" class="demo-view__title">UI 元件目錄</h1>
        <p class="demo-view__summary">
          F8 將待遷移元件維持 Candidate／Current 對照；已遷移元件則以同一正式
          Ui* 實作檢查 Token v2／active scope。兩者都不代表 View 核准。
        </p>
      </div>
      <dl class="demo-view__meta" aria-label="展示頁資訊">
        <div>
          <dt>檢查範圍</dt>
          <dd>Foundation → UiModal＋UiScrollRegion</dd>
        </div>
        <div>
          <dt>正式遷移</dt>
          <dd>{{ UI_DEMO_ADOPTED_SECTION_KEYS.length }} 個 section</dd>
        </div>
      </dl>
    </header>

    <UiScrollRegion
      class="demo-view__index-scroll"
      axis="horizontal"
      viewport-tag="nav"
      viewport-class="demo-view__index"
      aria-label="元件目錄分類"
    >
      <button
        v-for="group in UI_DEMO_GROUPS"
        :key="group.key"
        type="button"
        class="demo-view__index-button"
        @click="scrollToGroup(group.key)"
      >
        {{ group.title }}
      </button>
    </UiScrollRegion>

    <UiScrollRegion
      ref="scrollRegion"
      class="demo-view__scroll"
      axis="vertical"
      viewport-class="demo-view__body"
    >
      <section
        v-for="group in UI_DEMO_GROUPS"
        :id="`demo-group-${group.key}`"
        :key="group.key"
        class="demo-group"
        :data-review-status="UI_DEMO_GROUP_REVIEW_STATUS[group.key]"
        :aria-labelledby="`demo-group-${group.key}-title`"
      >
        <header class="demo-group__header">
          <div class="demo-group__heading">
            <h2 :id="`demo-group-${group.key}-title`" class="demo-group__title">
              {{ group.title }}
            </h2>
            <span class="demo-group__status">
              {{ GROUP_REVIEW_LABELS[UI_DEMO_GROUP_REVIEW_STATUS[group.key]] }}
            </span>
          </div>
          <p class="demo-group__description">{{ group.description }}</p>
        </header>
        <component
          :is="GROUP_COMPONENTS[group.key]"
          :sections="group.sections"
        />
      </section>
    </UiScrollRegion>
  </section>
</template>

<style scoped>
.demo-view {
  min-height: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  padding: var(--ui-shell-gutter);
  overflow: hidden;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
}

.demo-view__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ui-space-6);
  padding: var(--ui-space-5) var(--ui-panel-inset);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-view__intro {
  min-width: 0;
}

.demo-view__title,
.demo-view__summary,
.demo-view__meta,
.demo-view__meta dt,
.demo-view__meta dd,
.demo-group__title,
.demo-group__description,
.demo-group__status {
  margin: 0;
}

.demo-view__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-2xl);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-display);
}

.demo-view__summary {
  max-width: 70ch;
  margin-top: var(--ui-space-2);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-view__meta {
  display: block;
}

.demo-view__meta div {
  display: grid;
  gap: var(--ui-space-1);
}

.demo-view__meta dt {
  color: var(--ui-color-text-subtle);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.demo-view__meta dd {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  white-space: nowrap;
}

.demo-view__index-scroll {
  min-width: 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-surface);
}

.demo-view__index-scroll :deep(.demo-view__index) {
  display: flex;
  gap: var(--ui-space-1);
  padding: var(--ui-space-2) var(--ui-panel-inset);
}

.demo-view__index-button {
  min-height: var(--ui-control-height);
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 var(--ui-space-3);
  border: 0;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-color-text-muted);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
  cursor: pointer;
  transition:
    background-color var(--ui-motion-duration-feedback)
      var(--ui-motion-easing-standard),
    color var(--ui-motion-duration-feedback) var(--ui-motion-easing-standard);
}

.demo-view__index-button:hover {
  background: color-mix(in srgb, var(--ui-color-text) 10%, transparent);
  color: var(--ui-color-text);
}

.demo-view__index-button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.demo-view__scroll {
  min-height: 0;
}

.demo-view__scroll :deep(.demo-view__body) {
  padding: 0 var(--ui-panel-inset) var(--ui-space-6);
}

.demo-group {
  scroll-margin-top: calc(var(--ui-control-height) + var(--ui-space-5));
  padding-top: var(--ui-space-7);
}

.demo-group__header {
  display: grid;
  grid-template-columns: minmax(8.5rem, 11rem) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: baseline;
  padding-bottom: var(--ui-space-3);
}

.demo-group__heading {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}

.demo-group__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-xl);
  font-weight: var(--ui-font-weight-bold);
  line-height: var(--ui-line-height-heading);
}

.demo-group__description {
  max-width: 70ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.demo-group__status {
  flex: 0 0 auto;
  padding: 0 var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-pill);
  background: var(--ui-color-surface-raised);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

@media (max-width: 64rem) {
  .demo-view__header {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--ui-space-4);
  }

  .demo-view__meta dd {
    white-space: normal;
  }
}

@media (max-width: 58rem) {
  .demo-group__header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }
}

@media (max-width: 42rem) {
  .demo-view__header {
    padding-top: var(--ui-space-5);
  }

  .demo-view__meta div {
    grid-template-columns: 4rem minmax(0, 1fr);
    align-items: baseline;
  }
}
</style>
