import { reactive, readonly } from 'vue';

const DEFAULT_CONFIRM_LABEL = '確認';
const DEFAULT_CANCEL_LABEL = '取消';
const COPY_LIMITS = Object.freeze({
  title: 120,
  subject: 200,
  meta: 120,
  message: 500,
  detail: 500,
  actionLabel: 80,
});

const state = reactive({
  request: null,
});

let resolvePending = null;

function boundedText(value, limit) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
}

function normalizeRequest(options) {
  if (!options || typeof options !== 'object') return null;

  const title = boundedText(options.title, COPY_LIMITS.title);
  const message = boundedText(options.message, COPY_LIMITS.message);
  if (!title || !message) return null;

  return {
    title,
    subject: boundedText(options.subject, COPY_LIMITS.subject),
    meta: boundedText(options.meta, COPY_LIMITS.meta),
    message,
    detail: boundedText(options.detail, COPY_LIMITS.detail),
    confirmLabel:
      boundedText(options.confirmLabel, COPY_LIMITS.actionLabel) ||
      DEFAULT_CONFIRM_LABEL,
    cancelLabel:
      boundedText(options.cancelLabel, COPY_LIMITS.actionLabel) ||
      DEFAULT_CANCEL_LABEL,
    intent: options.intent === 'danger' ? 'danger' : 'neutral',
  };
}

function settle(result) {
  if (!resolvePending) return;
  const resolve = resolvePending;
  resolvePending = null;
  state.request = null;
  resolve(result);
}

function confirm(options) {
  if (resolvePending) return Promise.resolve(false);
  const request = normalizeRequest(options);
  if (!request) return Promise.resolve(false);

  state.request = request;
  return new Promise((resolve) => {
    resolvePending = resolve;
  });
}

function accept() {
  settle(true);
}

function cancel() {
  settle(false);
}

export function useAppConfirmation() {
  return {
    state: readonly(state),
    confirm,
    accept,
    cancel,
    dismiss: cancel,
  };
}
