<script setup>
import PerformanceWorkspace from '../components/performance/PerformanceWorkspace.vue';
import AppFolderPage from '../components/layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';
import { t } from '../utils/i18n.js';
</script>

<template>
  <AppSurfaceBoundary
    surface-id="performance"
    :child-hosts="['performance-session-workspace']"
  >
    <AppFolderPage
      mode="workspace"
      :body-label="t('session.page.workspaceBody')"
    >
      <PerformanceWorkspace />
    </AppFolderPage>
  </AppSurfaceBoundary>
</template>
