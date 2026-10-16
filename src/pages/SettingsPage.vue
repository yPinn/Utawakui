<script setup>
import AppFolderPage from '../components/layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import SettingsView from '../views/SettingsView.vue';
</script>

<template>
  <AppSurfaceBoundary surface-id="settings">
    <AppFolderPage mode="workspace" body-label="設定內容">
      <template #header>
        <UiPageHeader title="設定">
          <template #description>
            管理曲庫、音訊、進階功能與應用程式行為。
          </template>
        </UiPageHeader>
      </template>

      <SettingsView />
    </AppFolderPage>
  </AppSurfaceBoundary>
</template>
