<script setup>
import ImportView from '../../views/ImportView.vue';
import AppFolderPage from '../layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../layout/AppSurfaceBoundary.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
</script>

<template>
  <AppSurfaceBoundary surface-id="import">
    <AppFolderPage mode="document" body-label="匯入內容">
      <template #header>
        <UiPageHeader title="匯入" />
      </template>

      <ImportView />
    </AppFolderPage>
  </AppSurfaceBoundary>
</template>
