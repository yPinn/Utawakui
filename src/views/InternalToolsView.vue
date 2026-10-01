<script setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import InternalToolsNavigation from '../components/internal-tools/InternalToolsNavigation.vue';
import { useAppView } from '../composables/useAppView.js';
import {
  INTERNAL_TOOL_CATEGORIES,
  internalToolDefinition,
} from '../constants/internalTools.js';
import '../styles/tokens-v2.css';

const props = defineProps({
  activeToolId: { type: String, required: true },
});

const TOOL_COMPONENTS = Object.freeze({
  'music-analysis': defineAsyncComponent(
    () => import('../components/analysis/MusicAnalysisWorkbench.vue'),
  ),
  'diagnostics-workbench': defineAsyncComponent(
    () => import('../components/settings/DiagnosticsWorkbench.vue'),
  ),
  'music-analysis-evaluation': defineAsyncComponent(
    () => import('../components/analysis/MusicAnalysisEvaluationWorkbench.vue'),
  ),
  'lyrics-provider-review': defineAsyncComponent(
    () =>
      import('../components/lyrics-provider/LyricsProviderReviewWorkbench.vue'),
  ),
});

const { setActiveView } = useAppView();
const activeTool = computed(() => {
  const definition = internalToolDefinition(props.activeToolId);
  const component = TOOL_COMPONENTS[props.activeToolId];
  return definition && component ? { ...definition, component } : null;
});

let previousUiSystem;

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
</script>

<template>
  <section class="internal-tools-view" aria-label="內部工具">
    <InternalToolsNavigation
      :categories="INTERNAL_TOOL_CATEGORIES"
      :active-tool-id="activeToolId"
      @navigate="setActiveView"
    />
    <div class="internal-tools-view__body">
      <component :is="activeTool.component" v-if="activeTool" />
      <p v-else class="internal-tools-view__missing" role="status">
        找不到指定的內部工具。
      </p>
    </div>
  </section>
</template>

<style scoped>
.internal-tools-view {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-4);
  color: var(--ui-color-text);
}

.internal-tools-view__body {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.internal-tools-view__missing {
  margin: 0;
  padding: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  text-align: center;
}
</style>
