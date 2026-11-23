<script setup>
import { defineAsyncComponent, nextTick, shallowRef, watch } from 'vue';
import { useAppView } from '../../composables/useAppView.js';
import { t } from '../../utils/i18n.js';
import UiDisclosure from '../ui/UiDisclosure.vue';
import SettingsSection from './SettingsSection.vue';

const SettingsTestingTools = defineAsyncComponent(
  () => import('./SettingsTestingTools.vue'),
);
const open = shallowRef(false);
const { settingsSection, clearSettingsSection } = useAppView();

watch(
  settingsSection,
  async (section) => {
    if (section !== 'testing') return;
    clearSettingsSection();
    open.value = true;
    await nextTick();
    const target = document.getElementById('settings-testing');
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  },
  { immediate: true },
);
</script>

<template>
  <SettingsSection
    id="settings-testing"
    :title="t('settings.sections.testing')"
    tabindex="-1"
  >
    <UiDisclosure
      v-model:open="open"
      class="settings-section__disclosure"
      :label="t('settings.testing.open')"
    >
      <SettingsTestingTools v-if="open" />
    </UiDisclosure>
  </SettingsSection>
</template>
