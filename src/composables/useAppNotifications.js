import { readonly, shallowRef } from 'vue';
import { useAppDiagnostics } from './useAppDiagnostics.js';
import { normalizeAppError } from '../utils/appErrors.js';
import { t } from '../utils/i18n.js';

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

const REPEAT_FIELDS = Object.freeze([
  'title',
  'message',
  'tone',
  'variant',
  'actionLabel',
  'dismissLabel',
]);

// A background owner that fails the same way again (autosave, publish loops)
// keeps the visible notice instead of re-entering and re-announcing it.
function visibleRepeat(key, next) {
  const id = latestByKey.get(key);
  const current = items.value.find((item) => item.id === id);
  if (
    !current ||
    current.lifecycle !== 'persistent' ||
    next.lifecycle !== 'persistent'
  )
    return null;
  return REPEAT_FIELDS.every(
    (field) => (current[field] ?? '') === (next[field] ?? ''),
  )
    ? current
    : null;
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
  variant,
  lifecycle = variant === 'confirmation'
    ? 'persistent'
    : tone === 'success'
      ? 'transient'
      : 'persistent',
  progress = null,
  priority = 0,
  announcement = 'polite',
  consumeAction = true,
  dismissLabel = '',
}) {
  const repeat = visibleRepeat(key, {
    title,
    message,
    tone,
    variant,
    lifecycle,
    dismissLabel,
    actionLabel: typeof action === 'function' ? actionLabel : '',
  });
  if (repeat) {
    // The newest attempt owns the action; nothing else visible changes.
    if (typeof action === 'function') actions.set(repeat.id, action);
    return repeat.id;
  }
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
      ...(variant ? { variant } : {}),
      ...(dismissLabel ? { dismissLabel } : {}),
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
      title: t('shell.notifications.incompleteTitle'),
      message: t('shell.notifications.incompleteMessage'),
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
      title: t('shell.notifications.incompleteTitle'),
      message: t('shell.notifications.incompleteMessage'),
    });
    return false;
  }
}

// One exit for a failed operation: the renderer diagnostic (skipped when main
// already recorded it) and the notice share the same bounded public message.
// While an identical failure is still on screen, a repeat is the same incident
// and is not recorded again.
function notifyFailure({
  error,
  code,
  source,
  operation,
  context,
  message,
  ...notification
}) {
  const options = {
    code,
    source,
    operation,
    title: notification.title,
    message,
    context,
  };
  const notice = { tone: 'danger', ...notification };
  const publicMessage = normalizeAppError(error, options).message;
  const repeat = visibleRepeat(notice.key, {
    ...notice,
    message: publicMessage,
    lifecycle: notice.lifecycle ?? 'persistent',
    actionLabel:
      typeof notice.action === 'function' ? (notice.actionLabel ?? '') : '',
  });
  if (!repeat) useAppDiagnostics().recordError(error, options);
  notify({ ...notice, message: publicMessage });
  return publicMessage;
}

export function useAppNotifications() {
  return {
    items: readonly(items),
    notify,
    notifyFailure,
    update,
    dismiss,
    clear,
    runAction,
    isCurrent: (key, id) => latestByKey.get(key) === id,
  };
}
