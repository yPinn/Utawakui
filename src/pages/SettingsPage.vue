<script setup>
import AppFolderPage from '../components/layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import SettingsView from '../views/SettingsView.vue';
import { t } from '../utils/i18n.js';
</script>

<template>
  <AppSurfaceBoundary surface-id="settings">
    <AppFolderPage mode="document" :body-label="t('settings.page.bodyLabel')">
      <template #header>
        <UiPageHeader :title="t('settings.page.title')">
          <template #description>
            {{ t('settings.page.description') }}
          </template>
        </UiPageHeader>
      </template>

      <SettingsView />
    </AppFolderPage>
  </AppSurfaceBoundary>
</template>
