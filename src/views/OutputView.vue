<script setup>
import ObsDisplayWorkbench from '../components/output/ObsDisplayWorkbench.vue';
import { getOutputWorkbenchData } from '../constants/outputTemplates.js';

const { templates, templateGroups, styleSets, configs } =
  getOutputWorkbenchData();
</script>

<template>
  <ObsDisplayWorkbench
    :presets="templates"
    :template-groups="templateGroups"
    :style-sets="styleSets"
    :configs="configs"
  />
</template>
