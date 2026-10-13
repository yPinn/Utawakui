import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import {
  registerLocalImportActivity,
  registerProviderImportActivity,
  usePreparationActivity,
} from './usePreparationActivity.js';

describe('preparation activity sources', () => {
  it('projects registered domain state without owning or copying it', () => {
    const provider = reactive({ isImporting: false });
    const local = reactive({ isConverting: false });
    registerProviderImportActivity(provider);
    registerLocalImportActivity(local);

    const activity = usePreparationActivity();
    expect(activity.providerImport.value).toBe(provider);
    expect(activity.localImport.value).toBe(local);

    provider.isImporting = true;
    local.isConverting = true;
    expect(activity.providerImport.value.isImporting).toBe(true);
    expect(activity.localImport.value.isConverting).toBe(true);
  });
});
