import { shallowReadonly, shallowRef } from 'vue';

const providerImport = shallowRef(null);
const localImport = shallowRef(null);

export function registerProviderImportActivity(source) {
  providerImport.value = source;
}

export function registerLocalImportActivity(source) {
  localImport.value = source;
}

export function usePreparationActivity() {
  return {
    providerImport: shallowReadonly(providerImport),
    localImport: shallowReadonly(localImport),
  };
}
