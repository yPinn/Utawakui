<script setup>
import { computed, shallowRef } from 'vue';
import { Download, ListChecks, RefreshCw } from '../../icons/index.js';
import SettingsActionMenuButton from './SettingsActionMenuButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import { useLibraryMetadataMaintenance } from '../../composables/useLibraryMetadataMaintenance.js';
import { useLibraryReconciliation } from '../../composables/useLibraryReconciliation.js';
import LibraryReconciliationModal from './LibraryReconciliationModal.vue';
import { t } from '../../utils/i18n.js';

const { state, feedback, refresh, cancel, reload } =
  useLibraryMetadataMaintenance();
const props = defineProps({ disabled: Boolean });
const reconciliation = useLibraryReconciliation();
const detailsOpen = shallowRef(false);
const issues = computed(() => (!state.busy && state.progress?.issues) || []);
const actions = computed(() => [
  {
    id: 'fill',
    label: t('librarySettings.metadata.fill'),
    icon: Download,
  },
  {
    id: 'reconcile',
    label: t('librarySettings.metadata.reconcile'),
    icon: ListChecks,
  },
  {
    id: 'reload',
    label: t('librarySettings.metadata.reloadLocal'),
    icon: RefreshCw,
  },
]);
function manage(action) {
  if (props.disabled || state.busy || reconciliation.state.busy) return;
  if (action === 'fill') {
    detailsOpen.value = false;
    refresh();
  } else if (action === 'reconcile') reconciliation.open();
  else if (action === 'reload') reload();
}

function issueMessage(issue) {
  if (issue.reason !== 'no-match')
    return t('librarySettings.metadata.issueFailed');
  return issue.kind === 'track'
    ? t('librarySettings.metadata.trackNotMatched')
    : t('librarySettings.metadata.albumNotFound');
}
</script>

<template>
  <SettingsDocumentItem
    :icon="RefreshCw"
    :title="t('librarySettings.metadata.title')"
    :guidance="t('librarySettings.metadata.guidance')"
  >
    <template #actions>
      <UiButton
        v-if="state.busy && state.progress?.status === 'running'"
        variant="secondary"
        :disabled="state.cancelling"
        @click="cancel"
        >{{ t('librarySettings.metadata.stop') }}</UiButton
      >
      <SettingsActionMenuButton
        v-else
        :disabled="disabled || reconciliation.state.busy"
        :loading="state.busy"
        :loading-label="t('librarySettings.metadata.updating')"
        :label="t('librarySettings.metadata.manage')"
        :items="actions"
        @select="manage"
      />
    </template>
    <template v-if="feedback" #feedback>
      <UiHint
        :tone="state.error ? 'danger' : 'muted'"
        :role="state.error ? 'alert' : 'status'"
        >{{ feedback }}</UiHint
      >
      <UiDisclosure
        v-if="issues.length"
        v-model:open="detailsOpen"
        class="metadata-details"
        :label="t('librarySettings.metadata.details')"
      >
        <ul class="metadata-details__list">
          <li v-for="(issue, index) in issues" :key="index">
            <strong>
              {{ issue.title || t('librarySettings.metadata.unnamedItem') }}
            </strong>
            <span v-if="issue.artist" class="metadata-details__context">
              {{ issue.artist }}
            </span>
            <span class="metadata-details__context">{{
              issueMessage(issue)
            }}</span>
          </li>
        </ul>
      </UiDisclosure>
    </template>
  </SettingsDocumentItem>
  <LibraryReconciliationModal />
</template>

<style scoped>
.metadata-details {
  border-block: 0;
}

.metadata-details[open] {
  flex-basis: 100%;
}

.metadata-details__list {
  display: grid;
  gap: var(--ui-space-2);
  margin: 0;
  padding-inline-start: var(--ui-space-4);
  list-style: disc;
}

.metadata-details__context {
  display: block;
  color: var(--ui-color-text-muted);
}
</style>
