<script setup>
import ObsOutputWorkspace from '../components/output/ObsOutputWorkspace.vue';
import { getOutputWorkbenchData } from '../constants/outputTemplates.js';

const { templates, templateGroups, styleSets, configs } =
  getOutputWorkbenchData();
</script>

<template>
  <ObsOutputWorkspace
    :presets="templates"
    :template-groups="templateGroups"
    :style-sets="styleSets"
    :configs="configs"
  />
</template>
