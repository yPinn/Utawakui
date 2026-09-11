<script setup>
import ObsOutputWorkspace from '../components/output/ObsOutputWorkspace.vue';
import { getOutputWorkbenchData } from '../constants/outputTemplates.js';

const {
  templates,
  templateGroups,
  previewScene,
  slotDefinitions,
  slotDefaults,
} = getOutputWorkbenchData();
</script>

<template>
  <ObsOutputWorkspace
    :presets="templates"
    :template-groups="templateGroups"
    :preview-scene="previewScene"
    :slot-definitions="slotDefinitions"
    :slot-defaults="slotDefaults"
  />
</template>
