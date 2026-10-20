<script setup>
import SettingsApplicationSection from '../components/settings/SettingsApplicationSection.vue';
import SettingsAudioSection from '../components/settings/SettingsAudioSection.vue';
import SettingsCapabilitiesSection from '../components/settings/SettingsCapabilitiesSection.vue';
import LyricsResearchSettingsBlock from '../components/settings/LyricsResearchSettingsBlock.vue';
import SettingsLibrarySection from '../components/settings/SettingsLibrarySection.vue';
import SettingsSupportSection from '../components/settings/SettingsSupportSection.vue';
</script>

<template>
  <div class="settings-view">
    <SettingsLibrarySection />
    <SettingsAudioSection />
    <SettingsCapabilitiesSection>
      <template #after-processing><LyricsResearchSettingsBlock /></template>
    </SettingsCapabilitiesSection>
    <SettingsApplicationSection />
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
