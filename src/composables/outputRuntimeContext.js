import { computed, inject } from 'vue';
import OUTPUT_RUNTIME_VALUES from '../../shared/outputRuntimeValues.json';

export const OUTPUT_RUNTIME_KEY = Symbol('output-runtime');

const unavailableState = Object.freeze({
  status: Object.freeze({
    running: false,
    host: OUTPUT_RUNTIME_VALUES.host,
    port: OUTPUT_RUNTIME_VALUES.defaultPort,
    revision: 0,
    httpUrl: null,
    wsUrl: null,
    clients: 0,
    error: null,
  }),
  settings: Object.freeze({
    autoStart: true,
    port: OUTPUT_RUNTIME_VALUES.defaultPort,
  }),
  suggestedPorts: Object.freeze([]),
  profiles: Object.freeze([]),
  selectedProfileId: null,
  profilesLoaded: false,
  isStarting: false,
  isStopping: false,
  isLoadingProfiles: false,
  isSavingProfile: false,
  isLoadingSettings: false,
  isSavingSettings: false,
  error: '',
});

const unavailableRuntime = Object.freeze({
  state: unavailableState,
  selectedProfile: computed(() => null),
  start: async () => false,
  stop: async () => false,
  refreshSettings: async () => false,
  suggestPorts: async () => [],
  updateSettings: async () => false,
  loadProfiles: async () => false,
  saveTemplateSelection: async () => false,
});

export function useOutputRuntimeContext() {
  return inject(OUTPUT_RUNTIME_KEY, unavailableRuntime);
}
