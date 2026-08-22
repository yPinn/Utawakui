<script setup>
import ObsOutputWorkspace from '../components/output/ObsOutputWorkspace.vue';
import { getOutputWorkbenchData } from '../constants/outputTemplates.js';

const {
  templates,
  templateGroups,
  slotDefinitions,
  slotDefaults,
  appearanceOptions,
} = getOutputWorkbenchData();
</script>

<template>
  <ObsOutputWorkspace
    :presets="templates"
    :template-groups="templateGroups"
    :slot-definitions="slotDefinitions"
    :slot-defaults="slotDefaults"
    :appearance-options="appearanceOptions"
  />
</template>
