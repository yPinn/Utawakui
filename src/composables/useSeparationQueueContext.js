import { inject, readonly, shallowRef } from 'vue';

export const SEPARATION_QUEUE_KEY = Symbol('separation-queue');

const missingQueue = shallowRef(null);
const missingError = shallowRef('');
const FALLBACK_SEPARATION_QUEUE = Object.freeze({
  queue: readonly(missingQueue),
  error: readonly(missingError),
  enqueue: async () => null,
});

export function useSeparationQueueContext() {
  return inject(SEPARATION_QUEUE_KEY, FALLBACK_SEPARATION_QUEUE);
}
