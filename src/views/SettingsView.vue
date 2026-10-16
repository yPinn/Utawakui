<script setup>
import SettingsApplicationSection from '../components/settings/SettingsApplicationSection.vue';
import SettingsAudioSection from '../components/settings/SettingsAudioSection.vue';
import SettingsCapabilitiesSection from '../components/settings/SettingsCapabilitiesSection.vue';
import SettingsLibrarySection from '../components/settings/SettingsLibrarySection.vue';
import SettingsSupportSection from '../components/settings/SettingsSupportSection.vue';
</script>

<template>
  <div class="settings-view">
    <SettingsLibrarySection />
    <SettingsAudioSection />
    <SettingsApplicationSection />
    <SettingsCapabilitiesSection />
    <SettingsSupportSection />
  </div>
</template>

<style scoped>
.settings-view {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-7);
}

@container app-folder-layout (max-width: 56.25rem) {
  .settings-view {
    gap: var(--ui-space-6);
  }
}
</style>
