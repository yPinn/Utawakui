import { readonly, shallowRef } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';

const items = shallowRef([]);
const actions = new Map();
const latestByKey = new Map();
let revision = 0;

function dismiss(id) {
  items.value = items.value.filter((item) => item.id !== id);
  actions.delete(id);
}

function clear(key) {
  latestByKey.delete(key);
  for (const item of items.value) {
    if (item.key === key) dismiss(item.id);
  }
}

// Operation callbacks stay private. Domain owners still own requests and state;
// the shell only renders these public, caller-authored notification projections.
function notify({
  key,
  title,
  message = '',
  tone = 'success',
  actionLabel = '',
  action = null,
  lifecycle = tone === 'success' ? 'transient' : 'persistent',
  progress = null,
  priority = 0,
  announcement = 'polite',
  consumeAction = true,
}) {
  clear(key);
  const id = `notification-${++revision}`;
  latestByKey.set(key, id);
  if (typeof action === 'function') actions.set(id, action);
  items.value = [
    ...items.value,
    Object.freeze({
      id,
      key,
      title,
      message,
      tone,
      lifecycle,
      progress: Number.isFinite(progress)
        ? Math.min(100, Math.max(0, progress))
        : null,
      priority,
      announcement,
      consumeAction,
      dismissible: true,
      ...(actions.has(id) ? { actionLabel } : {}),
    }),
  ];
  return id;
}

function update(id, patch) {
  const current = items.value.find((item) => item.id === id);
  if (!current) return false;
  if ('action' in patch) {
    if (typeof patch.action === 'function') actions.set(id, patch.action);
    else actions.delete(id);
  }
  const content = { ...patch };
  delete content.action;
  delete content.id;
  delete content.key;
  const next = { ...current, ...content, id: current.id, key: current.key };
  next.progress = Number.isFinite(next.progress)
    ? Math.min(100, Math.max(0, next.progress))
    : null;
  if (!actions.has(id)) delete next.actionLabel;
  items.value = items.value.map((item) =>
    item.id === id ? Object.freeze(next) : item,
  );
  return true;
}

async function runAction(id) {
  const action = actions.get(id);
  const item = items.value.find((entry) => entry.id === id);
  if (!action || !item) return false;
  // Remove before awaiting: the action may publish a new result for this key.
  if (item.consumeAction) dismiss(id);
  try {
    await action();
    return true;
  } catch (error) {
    const { recordError } = useAppDiagnostics();
    recordError(error, {
      code: 'NOTIFICATION_ACTION_FAILED',
      source: 'notifications',
      operation: 'action',
      title: '操作未完成',
      message: '請回到原操作位置再試一次。',
    });
    if (latestByKey.get(item.key) !== id) return false;
    if (
      !item.consumeAction &&
      items.value.find((entry) => entry.id === id) !== item
    )
      return false;
    notify({
      key: item.key,
      tone: 'danger',
      title: '操作未完成',
      message: '請回到原操作位置再試一次。',
    });
    return false;
  }
}

export function useAppNotifications() {
  return {
    items: readonly(items),
    notify,
    update,
    dismiss,
    clear,
    runAction,
    isCurrent: (key, id) => latestByKey.get(key) === id,
  };
}
