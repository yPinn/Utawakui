import { onScopeDispose, shallowRef, watch } from 'vue';

// Session-only memory; clipboard contents are never persisted or logged.
const dismissedLinks = new Set();

export function useImportClipboardSuggestion({
  eligible,
  setInput,
  read = () => window.Utawakui?.getImportClipboardSuggestion?.(),
  dismissed = dismissedLinks,
}) {
  const url = shallowRef('');
  let generation = 0;
  let disposed = false;

  function invalidate() {
    generation++;
    url.value = '';
  }

  watch(eligible, invalidate, { flush: 'sync' });
  onScopeDispose(() => {
    disposed = true;
    invalidate();
  });

  async function check() {
    invalidate();
    if (disposed || !eligible()) return;
    const current = generation;
    try {
      const result = await read();
      if (
        !disposed &&
        current === generation &&
        eligible() &&
        typeof result === 'string' &&
        result &&
        !dismissed.has(result)
      ) {
        url.value = result;
      }
    } catch {
      // Clipboard access is optional; ordinary typing/paste remains available.
    }
  }

  function dismiss() {
    if (url.value) dismissed.add(url.value);
    invalidate();
  }

  function accept() {
    if (disposed || !eligible() || !url.value) return false;
    const value = url.value;
    dismiss();
    setInput(value);
    return true;
  }

  return { url, check, dismiss, accept };
}
