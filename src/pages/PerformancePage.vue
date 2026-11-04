<script setup>
import { defineAsyncComponent } from 'vue';
import { useAppView } from '../composables/useAppView.js';
import PerformanceWorkspace from '../components/performance/PerformanceWorkspace.vue';
import AppFolderPage from '../components/layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';
import { t } from '../utils/i18n.js';
const PerformanceSessionArchive = defineAsyncComponent(
  () =>
    import('../components/performance-session/PerformanceSessionArchive.vue'),
);
const { performanceArchiveId } = useAppView();
</script>

<template>
  <AppSurfaceBoundary
    surface-id="performance"
    :child-hosts="['performance-session-workspace']"
  >
    <AppFolderPage
      v-if="performanceArchiveId"
      :document-key="performanceArchiveId"
      :body-label="t('session.page.archiveBody')"
    >
      <PerformanceSessionArchive :session-id="performanceArchiveId" />
    </AppFolderPage>
    <AppFolderPage
      v-else
      mode="workspace"
      :body-label="t('session.page.workspaceBody')"
    >
      <PerformanceWorkspace />
    </AppFolderPage>
  </AppSurfaceBoundary>
</template>
