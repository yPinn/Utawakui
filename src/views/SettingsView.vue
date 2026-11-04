<script setup>
import SettingsApplicationSection from '../components/settings/SettingsApplicationSection.vue';
import SettingsCapabilitiesSection from '../components/settings/SettingsCapabilitiesSection.vue';
import CaptureOutputSettings from '../components/settings/CaptureOutputSettings.vue';
import LyricsResearchSettingsBlock from '../components/settings/LyricsResearchSettingsBlock.vue';
import SettingsLibrarySection from '../components/settings/SettingsLibrarySection.vue';
import SettingsSupportSection from '../components/settings/SettingsSupportSection.vue';
</script>

<template>
  <div class="settings-view">
    <SettingsApplicationSection />
    <SettingsLibrarySection />
    <SettingsCapabilitiesSection>
      <template #after-processing><LyricsResearchSettingsBlock /></template>
      <template #output-end><CaptureOutputSettings /></template>
    </SettingsCapabilitiesSection>
    <SettingsSupportSection />
  </div>
</template>

<style scoped>
.settings-view {
  --settings-section-gap: var(--ui-space-6);
  min-inline-size: 0;
  display: grid;
  gap: var(--settings-section-gap);
}

@container app-folder-layout (max-width: 56.25rem) {
  .settings-view {
    --settings-section-gap: var(--ui-space-5);
  }
}
</style>
