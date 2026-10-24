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
    :title="state.mode === 'create' ? '建立本機單曲' : '發行資訊'"
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
          aria-label="建立本機單曲"
          role="region"
          tabindex="0"
        >
          <UiHint v-if="state.loading" role="status">讀取中…</UiHint>
          <UiNotice v-if="state.error" tone="danger" :message="state.error" />
          <template v-if="state.mode === 'create'">
            <ul v-if="state.track" class="release-info-editor__tracks">
              <TrackIdentityRow :track="state.track" overflow="ellipsis" />
            </ul>
            <UiTextField
              id="release-create-name"
              label="發行名稱"
              :maxlength="200"
              :model-value="state.name"
              :disabled="disabled"
              required
              @update:model-value="editor.setName"
            />
            <UiHint>建立單曲發行，保留音檔與作品關聯。</UiHint>
          </template>
        </UiScrollLayout>
        <template v-else>
          <div class="release-info-editor__status">
            <UiHint v-if="state.loading" role="status">讀取中…</UiHint>
            <UiNotice
              v-if="state.error"
              tone="danger"
              :message="state.error"
              action-label="重新載入"
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
              aria-label="發行資料"
              role="region"
              tabindex="0"
            >
              <strong class="release-info-editor__name">{{
                state.release.name
              }}</strong>
              <UiHint>手動值優先；設為未知則不採用來源。</UiHint>
              <UiNotice
                v-if="state.release.effective.conflicts?.length"
                tone="warning"
                message="總曲數少於已收錄曲目，請校正。"
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
              aria-label="收錄曲目"
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
        >關閉</UiButton
      >
      <UiButton
        v-if="state.mode === 'create'"
        variant="accent"
        aria-label="建立本機單曲"
        :disabled="
          disabled || !state.name.trim() || state.libraryEpoch === null
        "
        :loading="state.saving"
        loading-label="建立中"
        @click="editor.create"
        >建立</UiButton
      >
      <UiButton
        v-else
        variant="accent"
        aria-label="儲存發行資訊"
        :disabled="
          disabled ||
          state.release?.canInitializeBindings ||
          !editor.isDirty.value
        "
        :loading="state.saving"
        loading-label="儲存中"
        @click="editor.save"
        >儲存</UiButton
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
