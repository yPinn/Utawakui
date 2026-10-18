import { computed, shallowReactive } from 'vue';

// One stack for modal keyboard ownership and notification suspension.
export const openModalStack = shallowReactive([]);
export const hasOpenModal = computed(() => openModalStack.length > 0);
