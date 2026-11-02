<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useReleaseOrganization } from '../../composables/useReleaseOrganization.js';
import { useLibrary } from '../../composables/useLibrary.js';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiTextField from '../ui/UiTextField.vue';
import ReleaseInfoFields from './ReleaseInfoFields.vue';
import ReleaseMembersPanel from './ReleaseMembersPanel.vue';
import { t } from '../../utils/i18n.js';
const editor = useReleaseOrganization();
const { state } = editor;
const { tracksById } = useLibrary();
const disabled = computed(
  () => state.loading || state.saving || state.needsReload,
);
onMounted(editor.initialize);
onUnmounted(editor.dispose);
</script>
<template>
  <UiModal
    :open="editor.isOpen.value"
    :title="
      t(
        state.mode === 'create'
          ? 'release.editor.createTitle'
          : 'release.editor.title',
      )
    "
    :size="state.mode === 'create' ? 'default' : 'wide'"
    max-block-size="small"
    :fixed-height="state.mode === 'edit'"
    body-mode="workspace"
    :close-disabled="state.saving"
    @close="editor.close"
  >
    <template #default>
      <div class="release-info-editor" :data-mode="state.mode">
        <UiScrollLayout
          v-if="state.mode === 'create'"
          class="release-info-editor__pane"
          content-class="release-info-editor__content"
          :aria-label="t('release.editor.createTitle')"
          role="region"
          tabindex="0"
        >
          <UiHint v-if="state.loading" role="status">{{
            t('release.editor.loading')
          }}</UiHint>
          <UiNotice v-if="state.error" tone="danger" :message="state.error" />
          <template v-if="state.mode === 'create'">
            <ul v-if="state.track" class="release-info-editor__tracks">
              <TrackIdentityRow :track="state.track" overflow="ellipsis" />
            </ul>
            <UiTextField
              id="release-create-name"
              :label="t('release.editor.name')"
              :maxlength="200"
              :model-value="state.name"
              :disabled="disabled"
              required
              @update:model-value="editor.setName"
            />
            <UiHint>{{ t('release.editor.createHint') }}</UiHint>
          </template>
        </UiScrollLayout>
        <template v-else>
          <div class="release-info-editor__status">
            <UiHint v-if="state.loading" role="status">{{
              t('release.editor.loading')
            }}</UiHint>
            <UiNotice
              v-if="state.error"
              tone="danger"
              :message="state.error"
              :action-label="t('release.editor.reload')"
              :action-disabled="state.saving || state.loading"
              @action="editor.reload"
            />
          </div>
          <div
            v-if="state.release && state.draft"
            class="release-info-editor__workspace"
          >
            <UiScrollLayout
              class="release-info-editor__pane"
              content-class="release-info-editor__content"
              :aria-label="t('release.editor.dataLabel')"
              role="region"
              tabindex="0"
            >
              <strong class="release-info-editor__name">{{
                state.release.name
              }}</strong>
              <UiHint>{{ t('release.editor.manualHint') }}</UiHint>
              <UiNotice
                v-if="state.release.effective.conflicts?.length"
                tone="warning"
                :message="t('release.editor.countBelowMembers')"
              />
              <ReleaseInfoFields
                :release="state.release"
                :draft="state.draft"
                :disabled="disabled"
                @update="editor.updateField"
              />
            </UiScrollLayout>
            <UiScrollLayout
              class="release-info-editor__pane"
              content-class="release-info-editor__content"
              :aria-label="t('release.editor.membersLabel')"
              role="region"
              tabindex="0"
            >
              <ReleaseMembersPanel
                :release="state.release"
                :tracks-by-id="tracksById"
                :disabled="disabled"
                :loading-more="state.loadingMore"
                @repair="editor.save({ reconfirmTrackIds: $event })"
                @initialize="editor.save({ initializeBindings: true })"
                @load-more="editor.loadMore"
              />
            </UiScrollLayout>
          </div>
        </template>
      </div>
    </template>
    <template #footer>
      <UiButton
        variant="secondary"
        :disabled="state.saving"
        @click="editor.close"
        >{{ t('release.editor.close') }}</UiButton
      >
      <UiButton
        v-if="state.mode === 'create'"
        variant="accent"
        :aria-label="t('release.editor.createTitle')"
        :disabled="
          disabled || !state.name.trim() || state.libraryEpoch === null
        "
        :loading="state.saving"
        :loading-label="t('release.editor.creating')"
        @click="editor.create"
        >{{ t('release.editor.create') }}</UiButton
      >
      <UiButton
        v-else
        variant="accent"
        :aria-label="t('release.editor.saveLabel')"
        :disabled="
          disabled ||
          state.release?.canInitializeBindings ||
          !editor.isDirty.value
        "
        :loading="state.saving"
        :loading-label="t('release.editor.saving')"
        @click="editor.save"
        >{{ t('release.editor.save') }}</UiButton
      >
    </template>
  </UiModal>
</template>
<style scoped>
.release-info-editor {
  min-block-size: 0;
  min-inline-size: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  container-type: inline-size;
}
.release-info-editor[data-mode='edit'] {
  grid-template-rows: auto minmax(0, 1fr);
}
.release-info-editor__status {
  min-inline-size: 0;
}
.release-info-editor__status p {
  margin-block: 0 var(--ui-space-2);
}
.release-info-editor__workspace {
  min-block-size: 0;
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
}
.release-info-editor__pane {
  --ui-scroll-layout-padding-block-start: var(--ui-space-1);
  --ui-scroll-layout-padding-block-end: var(--ui-space-1);
  --ui-scroll-layout-padding-inline-start: var(--ui-space-1);
  --ui-scroll-layout-padding-inline-end: var(--ui-space-1);
  min-block-size: 0;
  min-inline-size: 0;
}
@container (max-width: 38rem) {
  .release-info-editor__workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: repeat(2, minmax(0, 1fr));
  }
}
.release-info-editor :deep(.release-info-editor__content) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-4);
}
.release-info-editor__name {
  overflow-wrap: anywhere;
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
}
.release-info-editor__tracks {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
