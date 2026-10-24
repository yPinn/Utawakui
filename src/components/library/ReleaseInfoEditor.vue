<script setup>
import { computed, onMounted, onUnmounted } from 'vue';
import { useReleaseOrganization } from '../../composables/useReleaseOrganization.js';
import { useLibrary } from '../../composables/useLibrary.js';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiButton from '../ui/UiButton.vue';
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
    :max-block-size="state.mode === 'create' ? 'small' : 'large'"
    :fixed-height="state.mode === 'edit'"
    body-mode="workspace"
    :close-disabled="state.saving"
    @close="editor.close"
  >
    <template #default>
      <UiScrollLayout
        class="release-info-editor"
        content-class="release-info-editor__content"
      >
        <p v-if="state.loading" role="status">正在讀取發行資料…</p>
        <UiNotice
          v-if="state.error"
          tone="danger"
          :message="state.error"
          :action-label="state.mode === 'edit' ? '重新載入' : ''"
          :action-disabled="state.saving || state.loading"
          @action="editor.reload"
        />
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
          <p class="release-info-editor__hint">
            只將這首本機曲目建立為單曲發行，音源與作品連結會保留。建立後可編輯發行日期及其他資料。
          </p>
        </template>
        <template v-else-if="state.release && state.draft">
          <strong class="release-info-editor__name">{{
            state.release.name
          }}</strong>
          <p class="release-info-editor__hint">
            手動設定會保留至下次修改；沿用來源會移除人工覆寫。「明確設為未知」會保留未知的選擇。
          </p>
          <UiNotice
            v-if="state.release.effective.conflicts?.length"
            tone="warning"
            message="來源資料與目前成員數不一致，請確認正式總曲數。"
          />
          <ReleaseInfoFields
            :release="state.release"
            :draft="state.draft"
            :tracks-by-id="tracksById"
            :disabled="disabled"
            @update="editor.updateField"
            @lead="editor.setLeadTrackId"
          />
          <ReleaseMembersPanel
            :release="state.release"
            :tracks-by-id="tracksById"
            :disabled="disabled"
            :loading-more="state.loadingMore"
            @repair="editor.save({ reconfirmTrackIds: $event })"
            @initialize="editor.save({ initializeBindings: true })"
            @load-more="editor.loadMore"
          />
        </template>
      </UiScrollLayout>
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
        :disabled="
          disabled || !state.name.trim() || state.libraryEpoch === null
        "
        :loading="state.saving"
        loading-label="建立中"
        @click="editor.create"
        >建立本機單曲</UiButton
      >
      <UiButton
        v-else
        variant="accent"
        :disabled="
          disabled ||
          state.release?.canInitializeBindings ||
          !editor.isDirty.value
        "
        :loading="state.saving"
        loading-label="儲存中"
        @click="editor.save"
        >儲存發行資訊</UiButton
      >
    </template>
  </UiModal>
</template>
<style scoped>
.release-info-editor {
  min-block-size: 0;
}
.release-info-editor :deep(.release-info-editor__content) {
  display: grid;
  gap: var(--ui-space-5);
  padding: var(--ui-space-1);
}
.release-info-editor__hint {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
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
