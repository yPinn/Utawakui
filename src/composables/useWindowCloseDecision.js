import { reactive, readonly } from 'vue';

const CLOSE_ACTIONS = new Set(['tray', 'quit', 'cancel']);
const RESPONSE_ERROR = '目前無法完成關閉操作，請再試一次。';

export function useWindowCloseDecision() {
  const state = reactive({
    open: false,
    remember: false,
    isResponding: false,
    pendingAction: '',
    activeWork: '',
    error: '',
  });
  const bridge =
    typeof window === 'undefined' ? undefined : (window.Utawakui ?? undefined);
  let activeRequestId = null;
  let presentingRequestId = null;
  let requestGeneration = 0;
  let disposed = false;
  let unsubscribeRequest = () => undefined;
  let unsubscribeDismiss = () => undefined;

  function clearRequest() {
    activeRequestId = null;
    presentingRequestId = null;
    state.open = false;
    state.remember = false;
    state.isResponding = false;
    state.pendingAction = '';
    state.activeWork = '';
    state.error = '';
  }

  async function handleRequest(payload) {
    const requestId = payload?.requestId;
    if (
      disposed ||
      typeof requestId !== 'string' ||
      activeRequestId ||
      presentingRequestId
    ) {
      return;
    }
    presentingRequestId = requestId;
    const generation = ++requestGeneration;
    let accepted;
    try {
      accepted =
        (await bridge?.presentWindowCloseRequest?.(requestId)) === true;
    } catch {
      accepted = false;
    }
    if (
      disposed ||
      generation !== requestGeneration ||
      presentingRequestId !== requestId
    ) {
      return;
    }
    presentingRequestId = null;
    if (!accepted) return;
    activeRequestId = requestId;
    state.activeWork = payload?.activeWork === 'separation' ? 'separation' : '';
    state.remember = false;
    state.isResponding = false;
    state.pendingAction = '';
    state.error = '';
    state.open = true;
  }

  function handleDismiss(payload) {
    const requestId = payload?.requestId;
    if (
      typeof requestId !== 'string' ||
      (requestId !== activeRequestId && requestId !== presentingRequestId)
    ) {
      return;
    }
    requestGeneration += 1;
    clearRequest();
  }

  function setRemember(value) {
    if (!state.open || state.isResponding || state.activeWork) return;
    state.remember = value === true;
  }

  async function respond(action) {
    if (
      disposed ||
      !state.open ||
      state.isResponding ||
      !activeRequestId ||
      !CLOSE_ACTIONS.has(action)
    ) {
      return false;
    }
    const requestId = activeRequestId;
    const remember =
      action === 'cancel' || state.activeWork ? false : state.remember;
    state.isResponding = true;
    state.pendingAction = action;
    state.error = '';
    try {
      const accepted =
        (await bridge?.respondWindowCloseRequest?.(requestId, {
          action,
          remember,
        })) === true;
      if (!accepted) {
        state.error = RESPONSE_ERROR;
        return false;
      }
      if (activeRequestId === requestId) clearRequest();
      return true;
    } catch {
      if (activeRequestId === requestId) state.error = RESPONSE_ERROR;
      return false;
    } finally {
      if (activeRequestId === requestId) {
        state.isResponding = false;
        state.pendingAction = '';
      }
    }
  }

  function cancel() {
    return respond('cancel');
  }

  if (
    bridge?.onWindowCloseRequest &&
    bridge?.onWindowCloseDismiss &&
    bridge?.presentWindowCloseRequest &&
    bridge?.respondWindowCloseRequest
  ) {
    unsubscribeRequest = bridge.onWindowCloseRequest(handleRequest);
    unsubscribeDismiss = bridge.onWindowCloseDismiss(handleDismiss);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    requestGeneration += 1;
    unsubscribeRequest();
    unsubscribeDismiss();
    clearRequest();
  }

  return {
    state: readonly(state),
    cancel,
    dispose,
    respond,
    setRemember,
  };
}
