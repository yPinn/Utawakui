<script setup>
import AppSurfaceBoundary from '../components/layout/AppSurfaceBoundary.vue';
import ObsOutputWorkspace from '../components/output/ObsOutputWorkspace.vue';
import { getOutputWorkbenchData } from '../constants/outputTemplates.js';
import '../styles/features/output.css';

const {
  templates,
  templateGroups,
  previewScene,
  slotDefinitions,
  slotDefaults,
} = getOutputWorkbenchData();
</script>

<template>
  <AppSurfaceBoundary surface-id="display">
    <ObsOutputWorkspace
      :presets="templates"
      :template-groups="templateGroups"
      :preview-scene="previewScene"
      :slot-definitions="slotDefinitions"
      :slot-defaults="slotDefaults"
    />
  </AppSurfaceBoundary>
</template>
