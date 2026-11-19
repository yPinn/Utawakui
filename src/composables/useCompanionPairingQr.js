import { onScopeDispose, shallowRef, watch } from 'vue';

// Keeps a pairing QR ready while a view shows it: a code is created once the
// remote runs, a used or expired one stays drawn as stale until renewed, and
// an unused code is withdrawn when the view hides.
export function useCompanionPairingQr(companion, isVisible) {
  const url = shallowRef('');
  const expired = shallowRef(true);
  let expiryTimer = null;
  let disposed = false;
  let withdrawal = null;
  const isShowing = () => !disposed && isVisible();

  function withdraw() {
    withdrawal ??= companion.cancelPairing().finally(() => {
      withdrawal = null;
    });
    return withdrawal;
  }

  async function renew() {
    const created = await companion.beginPairing();
    if (created && !isShowing()) await withdraw();
    return created;
  }

  watch(
    () => companion.pairing.value,
    (pairing) => {
      clearTimeout(expiryTimer);
      const left = pairing ? pairing.expiresAt - Date.now() : 0;
      expired.value = left <= 0;
      if (!pairing || !isShowing()) return;
      url.value = pairing.url;
      if (left > 0)
        expiryTimer = setTimeout(() => {
          expired.value = true;
        }, left);
    },
    { immediate: true },
  );

  watch(
    [
      () => Boolean(companion.status.value?.running),
      () => Boolean(isVisible()),
      () => Boolean(companion.status.value?.pairing?.request),
    ],
    async ([running, visible]) => {
      if (!running || !visible) url.value = '';
      if (!visible && companion.pairing.value) await withdraw();
      if (!running || !visible) return;
      if (withdrawal) await withdrawal;
      if (
        isShowing() &&
        companion.status.value?.running &&
        !companion.status.value.pairing?.request &&
        !companion.pairing.value &&
        !url.value
      ) {
        void renew();
      }
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    disposed = true;
    clearTimeout(expiryTimer);
    if (companion.pairing.value) void withdraw();
  });

  return {
    url,
    expired,
    renew,
  };
}
