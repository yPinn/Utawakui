<script setup>
import { computed, defineAsyncComponent, nextTick } from 'vue';
import { ArrowLeft } from '../icons/index.js';
import { useAppView } from '../composables/useAppView.js';
import { focusAppDestinationTrigger } from '../utils/appDestinationFocus.js';
import LibraryBrowseWorkspace from '../components/library/LibraryBrowseWorkspace.vue';
import AppFolderPage from '../components/layout/AppFolderPage.vue';
import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';
import UiButton from '../components/ui/UiButton.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
import { t } from '../utils/i18n.js';

const LyricsAuthoringWorkspace = defineAsyncComponent(
  () => import('../components/lyrics/LyricsAuthoringWorkspace.vue'),
);

const { libraryWorkspace, returnFromLyricsAuthoring } = useAppView();

const workspaceDefinition = computed(() => ({
  component: LyricsAuthoringWorkspace,
  surfaceId: 'lyrics',
  title: t('library.lyricsWorkspace.title'),
  description: t('library.lyricsWorkspace.description'),
  bodyLabel: t('library.lyricsWorkspace.bodyLabel'),
  pageMode: 'workspace',
}));

async function returnToLiveLyrics() {
  returnFromLyricsAuthoring();
  await nextTick();
  focusAppDestinationTrigger('performance');
}
</script>

<template>
  <AppSurfaceBoundary surface-id="library" :child-hosts="['lyrics']">
    <LibraryBrowseWorkspace v-if="libraryWorkspace === 'browse'" />
    <AppSurfaceBoundary
      v-else
      :surface-id="workspaceDefinition.surfaceId"
      class="library-page__workspace"
      tag="div"
      detached-host
    >
      <AppFolderPage
        :mode="workspaceDefinition.pageMode"
        :body-label="workspaceDefinition.bodyLabel"
      >
        <template #header>
          <UiPageHeader :title="workspaceDefinition.title">
            <template #description>
              {{ workspaceDefinition.description }}
            </template>
            <template #actions>
              <UiButton :icon="ArrowLeft" @click="returnToLiveLyrics">
                {{ t('library.lyricsWorkspace.back') }}
              </UiButton>
            </template>
          </UiPageHeader>
        </template>
        <component
          :is="workspaceDefinition.component"
          :class="{
            'library-page__content--workspace':
              workspaceDefinition.pageMode === 'workspace',
          }"
        />
      </AppFolderPage>
    </AppSurfaceBoundary>
  </AppSurfaceBoundary>
</template>

<style scoped>
.library-page__workspace {
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.library-page__content--workspace {
  display: flex;
  min-height: 0;
  height: 100%;
}
</style>
