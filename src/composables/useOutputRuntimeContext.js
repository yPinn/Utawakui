import { inject } from 'vue';
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
    displayDelayMs: OUTPUT_RUNTIME_VALUES.defaultDisplayDelayMs,
  }),
  suggestedPorts: Object.freeze([]),
  slots: Object.freeze({}),
  slotsLoaded: false,
  isStarting: false,
  isStopping: false,
  isLoadingSlots: false,
  isSavingSlot: false,
  isLoadingSettings: false,
  isSavingSettings: false,
  error: '',
});

const unavailableRuntime = Object.freeze({
  state: unavailableState,
  start: async () => false,
  stop: async () => false,
  refreshSettings: async () => false,
  updateSettings: async () => false,
  loadSlots: async () => false,
  saveOutputSlot: async () => false,
  saveSlotSettings: async () => false,
  saveTemplateSelection: async () => false,
});

export function useOutputRuntimeContext() {
  return inject(OUTPUT_RUNTIME_KEY, unavailableRuntime);
}
