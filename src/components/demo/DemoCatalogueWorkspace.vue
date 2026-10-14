<script setup>
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import { UI_DEMO_GROUPS } from '../../constants/uiDemoSections.js';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiTabs from '../ui/UiTabs.vue';
import DemoActions from './DemoActions.vue';
import DemoContent from './DemoContent.vue';
import DemoFeedback from './DemoFeedback.vue';
import DemoFoundations from './DemoFoundations.vue';
import DemoInputs from './DemoInputs.vue';
import DemoNavigation from './DemoNavigation.vue';
import DemoOverlays from './DemoOverlays.vue';
import DemoTrackCollectionProposal from './DemoTrackCollectionProposal.vue';

const GROUP_COMPONENTS = Object.freeze({
  foundations: DemoFoundations,
  inputs: DemoInputs,
  actions: DemoActions,
  navigation: DemoNavigation,
  feedback: DemoFeedback,
  content: DemoContent,
  overlays: DemoOverlays,
  'track-collections': DemoTrackCollectionProposal,
});

const groupTabs = UI_DEMO_GROUPS.map(({ key, title }) => ({
  id: key,
  label: title,
}));
const activeGroupKey = shallowRef(UI_DEMO_GROUPS[0]?.key ?? '');
const activeGroup = computed(
  () =>
    UI_DEMO_GROUPS.find((group) => group.key === activeGroupKey.value) ??
    UI_DEMO_GROUPS[0],
);
const scrollLayout = useTemplateRef('scrollLayout');

function selectGroup(groupKey) {
  if (GROUP_COMPONENTS[groupKey]) activeGroupKey.value = groupKey;
}

watch(activeGroupKey, async () => {
  await nextTick();
  scrollLayout.value?.scrollTo({ top: 0, behavior: 'auto' });
});
</script>

<template>
  <div class="demo-catalogue-workspace">
    <UiTabs
      class="demo-catalogue-workspace__tabs"
      :items="groupTabs"
      :active-id="activeGroupKey"
      aria-label="元件型錄分類"
      tab-id-prefix="demo-catalogue"
      panel-id-prefix="demo-catalogue"
      variant="bar"
      @update:active-id="selectGroup"
    />

    <UiScrollLayout
      ref="scrollLayout"
      class="demo-catalogue-workspace__scroll"
      axis="vertical"
      viewport-class="demo-catalogue-workspace__viewport"
      content-class="demo-catalogue-workspace__content"
      role="region"
      aria-label="元件型錄內容"
      tabindex="0"
    >
      <section
        v-if="activeGroup"
        :id="`demo-catalogue-${activeGroup.key}-panel`"
        class="demo-catalogue-workspace__group"
        role="tabpanel"
        :aria-labelledby="`demo-catalogue-${activeGroup.key}-tab`"
      >
        <header class="demo-catalogue-workspace__group-header">
          <h2>{{ activeGroup.title }}</h2>
          <p>{{ activeGroup.description }}</p>
        </header>

        <component
          :is="GROUP_COMPONENTS[activeGroup.key]"
          :sections="activeGroup.sections"
        />
      </section>
    </UiScrollLayout>
  </div>
</template>

<style scoped>
.demo-catalogue-workspace {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.demo-catalogue-workspace__tabs {
  min-width: 0;
  padding-inline: var(--ui-space-2);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-catalogue-workspace__scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-space-5);
  --ui-scroll-layout-padding-block-end: var(--ui-space-6);
  --ui-scroll-layout-padding-inline-start: var(--ui-space-5);
  --ui-scroll-layout-padding-inline-end: var(--ui-space-5);

  min-height: 0;
}

.demo-catalogue-workspace__group,
.demo-catalogue-workspace__group-header {
  min-width: 0;
  display: grid;
}

.demo-catalogue-workspace__group {
  gap: var(--ui-space-4);
}

.demo-catalogue-workspace__group-header {
  grid-template-columns: minmax(8.5rem, 11rem) minmax(0, 1fr);
  align-items: baseline;
  gap: var(--ui-space-5);
  padding-bottom: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.demo-catalogue-workspace__group-header h2,
.demo-catalogue-workspace__group-header p {
  margin: 0;
}

.demo-catalogue-workspace__group-header h2 {
  color: var(--ui-color-text);
  font-size: var(--ui-type-heading-size);
  font-weight: var(--ui-type-heading-weight);
  line-height: var(--ui-type-heading-line-height);
}

.demo-catalogue-workspace__group-header p {
  max-width: 70ch;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

@container app-folder-layout (max-width: 36rem) {
  .demo-catalogue-workspace__scroll {
    --ui-scroll-layout-padding-block-start: var(--ui-space-4);
    --ui-scroll-layout-padding-block-end: var(--ui-space-5);
    --ui-scroll-layout-padding-inline-start: var(--ui-space-4);
    --ui-scroll-layout-padding-inline-end: var(--ui-space-4);
  }

  .demo-catalogue-workspace__group-header {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }
}
</style>
