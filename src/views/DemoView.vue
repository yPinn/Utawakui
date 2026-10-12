<script setup>
import DemoCatalogueWorkspace from '../components/demo/DemoCatalogueWorkspace.vue';
import AppFolderPage from '../components/layout/AppFolderPage.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
</script>

<template>
  <AppFolderPage
    class="demo-view"
    mode="workspace"
    body-label="UI 元件型錄"
    aria-labelledby="demo-catalogue-title"
  >
    <template #header>
      <UiPageHeader title="UI 元件型錄" title-id="demo-catalogue-title">
        <template #description>
          正式元件與必要差異的回歸檢查；頁面流程以 production View 為準。
        </template>
      </UiPageHeader>
    </template>

    <DemoCatalogueWorkspace />
  </AppFolderPage>
</template>

<style scoped>
.demo-view {
  min-width: 0;
  min-height: 0;
  height: 100%;
}
</style>
