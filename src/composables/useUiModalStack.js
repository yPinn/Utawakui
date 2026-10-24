import { computed, shallowReactive } from 'vue';

// One stack for modal keyboard ownership and notification suspension.
export const openModalStack = shallowReactive([]);
export const UI_MODAL_FLOATING_HOST_KEY = Symbol('ui-modal-floating-host');
export const hasOpenModal = computed(() => openModalStack.length > 0);
