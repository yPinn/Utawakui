<script setup>
import { computed, shallowRef, useTemplateRef, watch } from 'vue';
import { useLibraryReconciliation } from '../../composables/useLibraryReconciliation.js';
import {
  reconciliationItemLabel,
  reconciliationReason,
} from '../../utils/libraryReconciliation.js';
import UiModal from '../ui/UiModal.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiHint from '../ui/UiHint.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import ReconciliationMetadataFields from './ReconciliationMetadataFields.vue';
import ReconciliationMergePreview from './ReconciliationMergePreview.vue';
import LibraryTagWriteback from './LibraryTagWriteback.vue';

const api = useLibraryReconciliation();
const contentScroll = useTemplateRef('contentScroll');
const { state } = api;
const tagBusy = shallowRef(false);
const busy = computed(() => state.busy || tagBusy.value);
const decisions = shallowRef({}),
  choices = shallowRef({});
watch(
  () => state.preview?.previewId,
  () => {
    decisions.value = {};
    choices.value = {};
    contentScroll.value?.scrollTo({ top: 0 });
  },
  { flush: 'post' },
);
const dirty = computed(() =>
  Object.values(decisions.value).some((d) => d.action !== 'keep'),
);
const filterOptions = [
  { value: 'all', label: '所有項目' },
  { value: 'release-pair', label: '發行檢查' },
  { value: 'metadata', label: '曲目資訊' },
  { value: 'files', label: '音檔問題' },
  { value: 'reviewed', label: '已保留分開' },
];
function save() {
  api.commit(
    state.preview.kind === 'metadata'
      ? { decisions: decisions.value }
      : { mergeChoices: choices.value },
  );
}
</script>

<template>
  <UiModal
    :open="state.open"
    title="曲庫校對"
    size="wide"
    max-block-size="small"
    fixed-height
    body-mode="workspace"
    :close-disabled="busy"
    @close="api.close"
  >
    <UiScrollLayout
      ref="contentScroll"
      class="library-reconciliation__scroll"
      content-class="library-reconciliation"
      aria-label="校對內容"
      role="region"
      tabindex="0"
    >
      <UiHint v-if="state.error" tone="danger" role="alert">{{
        state.error
      }}</UiHint>
      <UiHint v-if="state.message" role="status">{{ state.message }}</UiHint>
      <UiHint v-if="state.scanning" role="status"
        >檢查中{{
          state.progress
            ? ` · ${state.progress.completed} / ${state.progress.total}`
            : '…'
        }}</UiHint
      >
      <UiButton v-if="state.needsRecovery" :disabled="busy" @click="api.recover"
        >恢復未完成操作</UiButton
      >
      <template v-if="state.preview">
        <ReconciliationMetadataFields
          v-if="state.preview.kind === 'metadata'"
          v-model:decisions="decisions"
          :preview="state.preview"
          :disabled="busy"
        />
        <LibraryTagWriteback
          v-if="state.preview.kind === 'metadata'"
          :track-id="state.preview.trackId"
          :disabled="busy || dirty"
          @busy="tagBusy = $event"
          @saved="api.tagsSaved"
        />
        <ReconciliationMergePreview
          v-else
          v-model:choices="choices"
          :preview="state.preview"
          :disabled="busy"
        />
      </template>
      <template v-else-if="state.page">
        <UiHint tone="text" class="library-reconciliation__summary">
          {{ state.page.summary.tracks }} 首曲目 ·
          {{ state.page.summary.releases }} 張發行 ·
          {{ state.page.summary.candidates }} 組疑似重複
        </UiHint>
        <UiSelect
          id="library-reconciliation-filter"
          label="項目"
          :options="filterOptions"
          :model-value="state.kind"
          :disabled="busy"
          @update:model-value="api.page(0, $event)"
        />
        <ul class="library-reconciliation__list" aria-label="曲庫檢查結果">
          <li
            v-for="item in state.page.items"
            :key="item.itemId"
            class="library-reconciliation__item"
          >
            <div class="library-reconciliation__copy">
              <strong>{{
                item.kind === 'release-pair'
                  ? `${item.leftName} ／ ${item.rightName}`
                  : item.title
              }}</strong>
              <UiHint class="library-reconciliation__detail">
                {{ reconciliationItemLabel(item.kind)
                }}<template v-if="item.artist"> · {{ item.artist }}</template
                ><template v-if="item.kind === 'metadata'">
                  <template v-if="item.fields.length">
                    · {{ `${item.fields.length} 個欄位有差異` }}</template
                  ></template
                ><template v-if="item.dismissed"> · 已保留分開</template>
              </UiHint>
              <UiHint v-if="item.kind === 'release-pair' && !item.mergeable">{{
                reconciliationReason(item.reason)
              }}</UiHint>
              <UiHint v-if="item.kind === 'duplicate-file'"
                >共
                {{ item.trackIds.length }}
                首，不會自動刪除。</UiHint
              >
            </div>
            <div class="library-reconciliation__actions">
              <UiButton
                v-if="['release-pair', 'metadata'].includes(item.kind)"
                :disabled="busy"
                :aria-label="
                  item.kind === 'metadata'
                    ? `校對：${item.title}`
                    : `比較發行：${item.leftName} ／ ${item.rightName}`
                "
                @click="api.preview(item)"
                >{{ item.kind === 'metadata' ? '校對' : '比較' }}</UiButton
              >
              <UiButton
                v-if="item.kind === 'release-pair'"
                :disabled="busy"
                @click="api.decide(item, item.dismissed ? 'review' : 'dismiss')"
                >{{ item.dismissed ? '重新列入' : '保留分開' }}</UiButton
              >
            </div>
          </li>
        </ul>
        <UiHint v-if="!state.page.total">沒有符合的項目。</UiHint>
        <div
          v-if="state.page.total > 25"
          class="library-reconciliation__actions"
        >
          <UiButton
            :disabled="busy || state.page.offset === 0"
            @click="api.page(Math.max(0, state.page.offset - 25))"
            >上一頁</UiButton
          >
          <span
            >{{ state.page.offset + 1 }}–{{
              Math.min(state.page.offset + 25, state.page.total)
            }}
            / {{ state.page.total }}</span
          >
          <UiButton
            :disabled="busy || state.page.offset + 25 >= state.page.total"
            @click="api.page(state.page.offset + 25)"
            >下一頁</UiButton
          >
        </div>
        <details
          v-if="state.page.merges.length"
          class="library-reconciliation__history"
        >
          <summary>合併紀錄</summary>
          <ul class="library-reconciliation__list">
            <li
              v-for="merge in state.page.merges"
              :key="merge.mergeId"
              class="library-reconciliation__item"
            >
              <span class="library-reconciliation__copy">{{ merge.name }}</span
              ><UiButton
                :disabled="busy"
                :aria-label="`復原合併：${merge.name}`"
                @click="api.undo(merge.mergeId)"
                >復原合併</UiButton
              >
            </li>
          </ul>
        </details>
      </template>
    </UiScrollLayout>
    <template #footer>
      <UiButton
        v-if="state.scanning"
        :disabled="state.cancelling"
        @click="api.cancel"
        >{{ state.cancelling ? '停止中' : '停止檢查' }}</UiButton
      >
      <UiButton v-if="state.preview" :disabled="busy" @click="api.back"
        >返回</UiButton
      >
      <UiButton v-else-if="!state.scanning" :disabled="busy" @click="api.scan"
        >重新檢查</UiButton
      >
      <UiButton :disabled="busy" @click="api.close">關閉</UiButton>
      <UiButton
        v-if="state.preview"
        variant="accent"
        :loading="state.busy"
        :disabled="
          busy ||
          (state.preview.kind === 'metadata'
            ? !dirty
            : !state.preview.mergeable)
        "
        @click="save"
        >{{ state.preview.kind === 'metadata' ? '儲存' : '合併發行' }}</UiButton
      >
    </template>
  </UiModal>
</template>

<style scoped>
.library-reconciliation__scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-space-1);
  --ui-scroll-layout-padding-block-end: var(--ui-space-1);
  --ui-scroll-layout-padding-inline-start: var(--ui-space-1);
  --ui-scroll-layout-padding-inline-end: var(--ui-space-1);
  min-block-size: 0;
  min-inline-size: 0;
}
.library-reconciliation__scroll :deep(.library-reconciliation) {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ui-space-4);
}
.library-reconciliation__list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.library-reconciliation__item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-3);
  border-block-end: 1px solid var(--ui-color-border);
}
.library-reconciliation__copy {
  flex: 1 1 16rem;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}
.library-reconciliation__detail {
  margin: var(--ui-space-1) 0;
}
.library-reconciliation__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}
.library-reconciliation__history {
  padding-block-start: var(--ui-space-3);
}
</style>
