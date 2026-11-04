import { computed, readonly, shallowRef } from 'vue';
import { t } from '../../utils/i18n.js';

export function createLyricsAcousticCapabilityOwner(getBridge) {
  const capability = shallowRef(null),
    busy = shallowRef(false),
    error = shallowRef(''),
    operation = shallowRef('');
  let revision = 0;
  const methods = {
    prepare: 'prepareLyricsAcousticCapability',
    verify: 'verifyLyricsAcousticCapability',
    repair: 'repairLyricsAcousticCapability',
    remove: 'removeLyricsAcousticCapability',
  };
  async function refresh() {
    if (busy.value) return capability.value;
    const request = ++revision;
    try {
      const value = await getBridge()?.getLyricsAcousticCapabilityStatus?.();
      if (!value || typeof value.status !== 'string')
        throw Error('unavailable');
      if (request === revision) {
        capability.value = value;
        error.value = '';
      }
    } catch {
      if (request === revision)
        error.value = t('lyricsResearch.acoustic.errors.status');
    }
    return capability.value;
  }
  async function action(name) {
    if (busy.value) return null;
    const bridge = getBridge();
    if (typeof bridge?.[methods[name]] !== 'function') {
      error.value = t('lyricsAcquisition.restartToSave');
      return null;
    }
    busy.value = true;
    operation.value = name;
    ++revision;
    error.value = '';
    try {
      const value = await bridge[methods[name]]();
      if (!value || typeof value.status !== 'string')
        throw Error('invalid status');
      capability.value = value;
      return value;
    } catch {
      error.value = t('lyricsResearch.acoustic.errors.operation');
      try {
        const value = await bridge.getLyricsAcousticCapabilityStatus?.();
        if (value && typeof value.status === 'string') capability.value = value;
      } catch {
        // Keep the last known status and the bounded operation error.
      }
      return null;
    } finally {
      busy.value = false;
      operation.value = '';
    }
  }
  async function cancel() {
    try {
      await getBridge()?.cancelLyricsAcousticCapability?.();
    } catch {
      error.value = t('lyricsResearch.acoustic.errors.cancel');
    }
  }
  return {
    capability: readonly(capability),
    operation: readonly(operation),
    busy: computed(() => busy.value || capability.value?.busy === true),
    error: readonly(error),
    refresh,
    cancel,
    prepare: () => action('prepare'),
    verify: () => action('verify'),
    repair: () => action('repair'),
    remove: () => action('remove'),
  };
}
let sharedOwner;
export function useLyricsAcousticCapability() {
  return (sharedOwner ??= createLyricsAcousticCapabilityOwner(() =>
    typeof window === 'undefined' ? null : window.Utawakui,
  ));
}
