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
import { t } from '../../utils/i18n.js';

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
  { value: 'all', label: t('reconciliation.filters.all') },
  { value: 'release-pair', label: t('reconciliation.filters.releasePair') },
  { value: 'metadata', label: t('reconciliation.filters.metadata') },
  { value: 'files', label: t('reconciliation.filters.files') },
  { value: 'reviewed', label: t('reconciliation.filters.reviewed') },
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
    :title="t('reconciliation.title')"
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
      :aria-label="t('reconciliation.contents')"
      role="region"
      tabindex="0"
    >
      <UiHint v-if="state.error" tone="danger" role="alert">{{
        state.error
      }}</UiHint>
      <UiHint v-if="state.message" role="status">{{ state.message }}</UiHint>
      <UiHint v-if="state.scanning" role="status">{{
        state.progress
          ? t('reconciliation.scanningProgress', {
              completed: state.progress.completed,
              total: state.progress.total,
            })
          : t('reconciliation.scanning')
      }}</UiHint>
      <UiButton
        v-if="state.needsRecovery"
        :disabled="busy"
        @click="api.recover"
        >{{ t('reconciliation.recover') }}</UiButton
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
          {{
            t('reconciliation.summary', {
              tracks: state.page.summary.tracks,
              releases: state.page.summary.releases,
              candidates: state.page.summary.candidates,
            })
          }}
        </UiHint>
        <UiSelect
          id="library-reconciliation-filter"
          :label="t('reconciliation.filter')"
          :options="filterOptions"
          :model-value="state.kind"
          :disabled="busy"
          @update:model-value="api.page(0, $event)"
        />
        <ul
          class="library-reconciliation__list"
          :aria-label="t('reconciliation.results')"
        >
          <li
            v-for="item in state.page.items"
            :key="item.itemId"
            class="library-reconciliation__item"
          >
            <div class="library-reconciliation__copy">
              <strong>{{
                item.kind === 'release-pair'
                  ? t('reconciliation.pair', {
                      left: item.leftName,
                      right: item.rightName,
                    })
                  : item.title
              }}</strong>
              <UiHint class="library-reconciliation__detail">
                {{ reconciliationItemLabel(item.kind)
                }}<template v-if="item.artist"
                  >{{ t('reconciliation.detailSeparator')
                  }}{{ item.artist }}</template
                ><template v-if="item.kind === 'metadata' && item.fields.length"
                  >{{ t('reconciliation.detailSeparator')
                  }}{{
                    t(
                      'reconciliation.fieldDifferences',
                      { count: item.fields.length },
                      item.fields.length,
                    )
                  }}</template
                ><template v-if="item.dismissed"
                  >{{ t('reconciliation.detailSeparator')
                  }}{{ t('reconciliation.keptSeparate') }}</template
                >
              </UiHint>
              <UiHint v-if="item.kind === 'release-pair' && !item.mergeable">{{
                reconciliationReason(item.reason)
              }}</UiHint>
              <UiHint v-if="item.kind === 'duplicate-file'">{{
                t(
                  'reconciliation.duplicateCount',
                  { count: item.trackIds.length },
                  item.trackIds.length,
                )
              }}</UiHint>
            </div>
            <div class="library-reconciliation__actions">
              <UiButton
                v-if="['release-pair', 'metadata'].includes(item.kind)"
                :disabled="busy"
                :aria-label="
                  item.kind === 'metadata'
                    ? t('reconciliation.reviewNamed', { title: item.title })
                    : t('reconciliation.compareNamed', {
                        left: item.leftName,
                        right: item.rightName,
                      })
                "
                @click="api.preview(item)"
                >{{
                  t(
                    item.kind === 'metadata'
                      ? 'reconciliation.review'
                      : 'reconciliation.compare',
                  )
                }}</UiButton
              >
              <UiButton
                v-if="item.kind === 'release-pair'"
                :disabled="busy"
                @click="api.decide(item, item.dismissed ? 'review' : 'dismiss')"
                >{{
                  t(
                    item.dismissed
                      ? 'reconciliation.restore'
                      : 'reconciliation.keepSeparate',
                  )
                }}</UiButton
              >
            </div>
          </li>
        </ul>
        <UiHint v-if="!state.page.total">{{
          t('reconciliation.noMatches')
        }}</UiHint>
        <div
          v-if="state.page.total > 25"
          class="library-reconciliation__actions"
        >
          <UiButton
            :disabled="busy || state.page.offset === 0"
            @click="api.page(Math.max(0, state.page.offset - 25))"
            >{{ t('common.previousPage') }}</UiButton
          >
          <span>{{
            t('reconciliation.range', {
              start: state.page.offset + 1,
              end: Math.min(state.page.offset + 25, state.page.total),
              total: state.page.total,
            })
          }}</span>
          <UiButton
            :disabled="busy || state.page.offset + 25 >= state.page.total"
            @click="api.page(state.page.offset + 25)"
            >{{ t('common.nextPage') }}</UiButton
          >
        </div>
        <details
          v-if="state.page.merges.length"
          class="library-reconciliation__history"
        >
          <summary>{{ t('reconciliation.mergeHistory') }}</summary>
          <ul class="library-reconciliation__list">
            <li
              v-for="merge in state.page.merges"
              :key="merge.mergeId"
              class="library-reconciliation__item"
            >
              <span class="library-reconciliation__copy">{{ merge.name }}</span
              ><UiButton
                :disabled="busy"
                :aria-label="
                  t('reconciliation.undoMergeNamed', { name: merge.name })
                "
                @click="api.undo(merge.mergeId)"
                >{{ t('reconciliation.undoMerge') }}</UiButton
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
        >{{
          state.cancelling ? t('common.stopping') : t('reconciliation.stopScan')
        }}</UiButton
      >
      <UiButton v-if="state.preview" :disabled="busy" @click="api.back">{{
        t('common.back')
      }}</UiButton>
      <UiButton
        v-else-if="!state.scanning"
        :disabled="busy"
        @click="api.scan"
        >{{ t('reconciliation.rescan') }}</UiButton
      >
      <UiButton :disabled="busy" @click="api.close">{{
        t('common.close')
      }}</UiButton>
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
        >{{
          t(
            state.preview.kind === 'metadata'
              ? 'reconciliation.save'
              : 'reconciliation.merge',
          )
        }}</UiButton
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
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
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
