<script setup>
import PerformanceWorkspace from '../components/performance/PerformanceWorkspace.vue';
import AppFolderPage from '../components/layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';
</script>

<template>
  <AppSurfaceBoundary
    surface-id="performance"
    :child-hosts="['performance-session-workspace']"
  >
    <AppFolderPage mode="workspace" body-label="演唱工作區">
      <PerformanceWorkspace />
    </AppFolderPage>
  </AppSurfaceBoundary>
</template>
