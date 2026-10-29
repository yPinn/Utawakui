import { watch } from 'vue';
import { createGlobalShortcutReceiver } from '../utils/globalShortcutReceiver.js';
import { hasOpenTransientOverlay } from '../utils/transientOverlay.js';
import { isShortcutInputBlocked } from '../utils/shortcutInputContext.js';

const overlays = '[role="dialog"], [role="alertdialog"], [role="menu"]';
export function useGlobalShortcutReceiver({
  commands,
  getShortcutContext,
  getRegistryRevision,
  bridge = globalThis.window?.Utawakui,
}) {
  const document = globalThis.document,
    window = globalThis.window;
  let composing = false,
    active = false,
    observer = null;
  const listeners = [];
  let receiver;
  const changed = () => receiver?.contextChanged(true);
  function isBlocked(role) {
    const context = getShortcutContext();
    if (
      role === 'blocked' ||
      context.recording ||
      context.blocked ||
      context.globalBlocked ||
      hasOpenTransientOverlay()
    )
      return true;
    // A background window may retain its last editable activeElement. This says
    // nothing about another application's text/IME and must not block that mode.
    if (document?.hasFocus?.() === false) return false;
    if (composing) return true;
    const path = [];
    let target = document?.activeElement;
    for (let depth = 0; target?.shadowRoot?.activeElement; depth++) {
      if (depth >= 128) return true;
      path.push(target);
      target = target.shadowRoot.activeElement;
    }
    return isShortcutInputBlocked(
      { target, composedPath: () => path },
      context,
    );
  }
  function ownership(value) {
    if (value === active) return;
    active = value;
    for (const [node, type, fn] of listeners.splice(0))
      node.removeEventListener(type, fn, true);
    observer?.disconnect();
    observer = null;
    composing = false;
    if (!active) return;
    const add = (node, type, fn) => {
      node?.addEventListener?.(type, fn, true);
      if (node?.addEventListener) listeners.push([node, type, fn]);
    };
    add(document, 'compositionstart', () => {
      composing = true;
      changed();
    });
    add(document, 'compositionend', () => {
      composing = false;
      changed();
    });
    add(document, 'focusin', changed);
    add(document, 'focusout', changed);
    add(window, 'focus', changed);
    add(window, 'blur', () => {
      composing = false;
      changed();
    });
    const relevant = (node) =>
      node?.matches?.(overlays) || node?.querySelector?.(overlays);
    if (globalThis.MutationObserver && document?.documentElement) {
      observer = new MutationObserver((records) => {
        if (
          records.some((record) =>
            record.type === 'attributes'
              ? relevant(record.target) ||
                ['dialog', 'alertdialog', 'menu'].includes(record.oldValue)
              : [...record.addedNodes, ...record.removedNodes].some(relevant),
          )
        )
          changed();
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['role'],
        attributeOldValue: true,
      });
    }
  }
  receiver = createGlobalShortcutReceiver({
    bridge,
    commands,
    isBlocked,
    getRegistryRevision,
    onOwnershipChange: ownership,
  });
  const stopUI = watch(
    () => {
      const context = getShortcutContext();
      return [
        Boolean(context.recording),
        Boolean(context.blocked),
        Boolean(context.globalBlocked),
      ];
    },
    changed,
    { flush: 'sync' },
  );
  const stopSource = watch(
    () => commands.contextIdentity?.(),
    () => receiver.contextChanged(false),
    { flush: 'sync' },
  );
  return {
    ...receiver,
    dispose() {
      stopUI();
      stopSource();
      ownership(false);
      return receiver.dispose();
    },
  };
}
