<script setup>
import { useAppNotifications } from '../../composables/useAppNotifications.js';
import { useAppRightDockWidth } from '../../composables/useAppRightDockWidth.js';
import UiNotificationHost from '../ui/UiNotificationHost.vue';
import { hasOpenModal } from '../../composables/useUiModalStack.js';

const { items, dismiss, runAction } = useAppNotifications();
const { width } = useAppRightDockWidth();
</script>

<template>
  <UiNotificationHost
    :items="items"
    :inline-size="width"
    placement="top-end"
    :suspended="hasOpenModal"
    @dismiss="dismiss($event.id)"
    @action="runAction"
  />
</template>
