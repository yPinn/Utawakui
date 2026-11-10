<script setup>
import { computed, shallowRef } from 'vue';
import { Eye, FolderInput, Tag } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';
import UiHint from '../ui/UiHint.vue';
import SettingsActionMenuButton from './SettingsActionMenuButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import LibraryStyleAdoptionModal from './LibraryStyleAdoptionModal.vue';

const props = defineProps({ disabled: Boolean });
const busy = shallowRef(false);
const feedback = shallowRef('');
const failed = shallowRef(false);
const adoptionOpen = shallowRef(false);
const actions = computed(() => [
  { id: 'import', label: t('trackStyle.importCandidates'), icon: FolderInput },
  { id: 'preview', label: t('trackStyle.adoptionPreview'), icon: Eye },
]);

function manage(action) {
  if (props.disabled || busy.value) return;
  if (action === 'import') importCandidates();
  else if (action === 'preview') adoptionOpen.value = true;
}

function reportAdoption(result) {
  failed.value = false;
  feedback.value = t('trackStyle.adoptionResult', result);
}

async function importCandidates() {
  busy.value = true;
  feedback.value = '';
  failed.value = false;
  try {
    const result = await window.Utawakui.importTrackStyleCandidates();
    if (result?.canceled) return;
    if (result?.ok) {
      feedback.value = t('trackStyle.importResult', result);
    } else {
      failed.value = true;
      feedback.value = t(
        {
          invalid: 'trackStyle.importInvalid',
          stale: 'trackStyle.importStale',
          busy: 'trackStyle.importing',
        }[result?.status] ?? 'trackStyle.importFailed',
      );
    }
  } catch {
    failed.value = true;
    feedback.value = t('trackStyle.importFailed');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SettingsDocumentItem
    id="settings-library-style-candidates"
    :icon="Tag"
    :title="t('trackStyle.importTitle')"
    :guidance="t('trackStyle.importGuidance')"
  >
    <template #actions>
      <SettingsActionMenuButton
        :disabled="disabled"
        :loading="busy"
        :loading-label="t('trackStyle.importing')"
        :label="t('trackStyle.manageCandidates')"
        :items="actions"
        @select="manage"
      />
    </template>
    <template v-if="feedback" #feedback>
      <UiHint
        :tone="failed ? 'danger' : 'muted'"
        :role="failed ? 'alert' : 'status'"
      >
        {{ feedback }}
      </UiHint>
    </template>
  </SettingsDocumentItem>
  <LibraryStyleAdoptionModal
    :open="adoptionOpen"
    @close="adoptionOpen = false"
    @adopted="reportAdoption"
  />
</template>
