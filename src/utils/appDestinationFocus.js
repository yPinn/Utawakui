import { isAppDestination } from './appDestinationRegistry.js';

export function focusAppDestinationTrigger(
  destinationId,
  documentRef = globalThis.document,
) {
  if (!isAppDestination(destinationId) || !documentRef?.querySelector) {
    return false;
  }
  const trigger = documentRef.querySelector(
    `[data-app-workflow-trigger="${destinationId}"]`,
  );
  if (typeof trigger?.focus !== 'function') return false;
  trigger.focus();
  return true;
}
