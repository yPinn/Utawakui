<script setup>
import AppFolderPage from '../layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../layout/AppSurfaceBoundary.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import ImportWorkspace from './ImportWorkspace.vue';
</script>

<template>
  <AppSurfaceBoundary surface-id="import">
    <AppFolderPage mode="document" body-label="匯入內容">
      <template #header>
        <UiPageHeader title="匯入" />
      </template>

      <ImportWorkspace />
    </AppFolderPage>
  </AppSurfaceBoundary>
</template>
