import { computed, inject } from 'vue';

export const OUTPUT_RUNTIME_KEY = Symbol('output-runtime');

const unavailableState = Object.freeze({
  status: Object.freeze({
    running: false,
    host: '127.0.0.1',
    port: 17404,
    revision: 0,
    httpUrl: null,
    wsUrl: null,
    clients: 0,
  }),
  profiles: Object.freeze([]),
  selectedProfileId: null,
  profilesLoaded: false,
  isStarting: false,
  isStopping: false,
  isLoadingProfiles: false,
  isSavingProfile: false,
  error: '',
});

const unavailableRuntime = Object.freeze({
  state: unavailableState,
  selectedProfile: computed(() => null),
  start: async () => false,
  stop: async () => false,
  loadProfiles: async () => false,
  saveTemplateSelection: async () => false,
});

export function useOutputRuntimeContext() {
  return inject(OUTPUT_RUNTIME_KEY, unavailableRuntime);
}
