'use strict';
const { randomUUID } = require('node:crypto');
const {
  parseReceiverIntent,
  parseReceiverOffer,
  parseGlobalShortcutEnvelope,
} = require('../../shared/globalShortcutReceiver.mjs');

function createKeyboardShortcutReceiver({
  getMainWindow,
  getFocusedWindow = () => null,
  getRuntime,
  rearm,
  onError = () => {},
  now = Date.now,
}) {
  let lease = null,
    disposed = false,
    arming = false,
    lastBoot = null,
    lastSequence = 0;
  const pending = new Map();
  function report(error) {
    try {
      onError(error, 'receiver');
    } catch {
      /* Diagnostics cannot restore a lease. */
    }
  }
  function alive(current = lease, allowLoading = false) {
    const window = getMainWindow();
    return (
      !disposed &&
      current &&
      window === current.window &&
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      window.webContents.mainFrame === current.frame &&
      (allowLoading || !window.webContents.isLoadingMainFrame?.())
    );
  }
  function role() {
    const window = getMainWindow(),
      focused = getFocusedWindow();
    if (
      !window ||
      window.isDestroyed() ||
      (focused && focused !== window) ||
      window.webContents.isDevToolsFocused?.()
    )
      return 'blocked';
    return focused === window || window.isFocused?.() ? 'main' : 'background';
  }
  function projection(current, offerId = randomUUID()) {
    const runtime = getRuntime();
    return parseReceiverOffer({
      version: 1,
      receiverId: current.id,
      offerId,
      bootId: runtime.bootId,
      generation: runtime.generation,
      active: runtime.state === 'active' && !runtime.busy ? runtime.active : [],
      role: role(),
    });
  }
  function detach() {
    if (!lease) return;
    for (const [event, listener] of lease.listeners)
      lease.window.webContents.removeListener(event, listener);
    lease = null;
    pending.clear();
  }
  function sendState() {
    if (!alive()) return;
    try {
      lease.window.webContents.send(
        'keyboard-shortcuts:receiver-state',
        lease.offer,
      );
    } catch (error) {
      report(error);
      detach();
    }
  }
  function refresh(force = false) {
    if (!alive(lease, true)) {
      detach();
      return;
    }
    if (!alive()) {
      lease.armed = false;
      pending.clear();
      return;
    }
    const next = projection(lease, lease.offer.offerId);
    if (!force && JSON.stringify(next) === JSON.stringify(lease.offer)) return;
    lease.offer = { ...next, offerId: randomUUID() };
    lease.armed = false;
    lease.contextRevision = 0;
    pending.clear();
    sendState();
  }
  function connect() {
    detach();
    if (disposed) return { status: 'unavailable' };
    const window = getMainWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed())
      return { status: 'unavailable' };
    const current = {
      id: randomUUID(),
      window,
      frame: window.webContents.mainFrame,
      armed: false,
      contextRevision: 0,
      listeners: [],
    };
    lease = current;
    current.offer = projection(current);
    const gone = () => {
      if (lease === current) detach();
    };
    const navigate = (details) => {
      if (details?.isMainFrame) gone();
    };
    const loaded = () => {
      if (lease === current) refresh(true);
    };
    for (const [event, listener] of [
      ['destroyed', gone],
      ['render-process-gone', gone],
      ['unresponsive', gone],
      ['did-finish-load', loaded],
      ['did-start-navigation', navigate],
    ]) {
      current.listeners.push([event, listener]);
      window.webContents.on(event, listener);
    }
    return { status: 'offered', offer: current.offer };
  }
  async function confirm(input) {
    const intent = parseReceiverIntent('confirm', input),
      current = lease;
    if (
      !alive(current) ||
      intent.receiverId !== current.id ||
      intent.offerId !== current.offer.offerId ||
      intent.contextRevision < current.contextRevision
    )
      return { status: 'stale' };
    const runtime = getRuntime();
    if (
      runtime.generation !== current.offer.generation ||
      runtime.bootId !== current.offer.bootId
    ) {
      refresh();
      return { status: 'stale' };
    }
    if (arming || runtime.busy) return { status: 'busy' };
    if (role() === 'blocked') return { status: 'blocked' };
    if (current.armed && intent.contextRevision === current.contextRevision)
      return { status: 'ready', offer: current.offer };
    current.armed = false;
    current.contextRevision = intent.contextRevision;
    pending.clear();
    arming = true;
    const offerId = current.offer.offerId;
    try {
      const confirmed = await rearm(runtime.generation);
      if (
        lease !== current ||
        !alive(current) ||
        current.offer.offerId !== offerId
      )
        return { status: 'stale' };
      if (
        !confirmed ||
        confirmed.busy ||
        !['active', 'disabled'].includes(confirmed.state)
      ) {
        refresh(true);
        return { status: 'unavailable' };
      }
      current.offer = projection(current, offerId);
      current.armed = true;
      return { status: 'ready', offer: current.offer };
    } catch (error) {
      report(error);
      if (lease === current) current.armed = false;
      return { status: 'unavailable' };
    } finally {
      arming = false;
      if (
        (lease && lease !== current) ||
        (lease === current && current.offer.offerId !== offerId)
      )
        refresh(true);
    }
  }
  function prune() {
    const deadline = now();
    for (const [id, item] of pending)
      if (item.expires <= deadline) pending.delete(id);
  }
  function dispatch(value) {
    const runtime = getRuntime();
    if (
      !value ||
      value.bootId !== runtime.bootId ||
      !Number.isSafeInteger(value.sequence) ||
      value.sequence < 1
    )
      return false;
    if (lastBoot !== value.bootId) {
      lastBoot = value.bootId;
      lastSequence = 0;
    }
    if (value.sequence <= lastSequence) return false;
    lastSequence = value.sequence;
    if (
      !alive() ||
      !lease.armed ||
      runtime.busy ||
      runtime.state !== 'active' ||
      value.generation !== runtime.generation ||
      value.generation !== lease.offer.generation ||
      role() === 'blocked' ||
      !runtime.active.some((b) => b.command === value.command)
    )
      return false;
    prune();
    if (pending.size >= 32) return false;
    const envelope = parseGlobalShortcutEnvelope({
      version: 1,
      ...value,
      receiverId: lease.id,
      offerId: lease.offer.offerId,
      contextRevision: lease.contextRevision,
    });
    pending.set(envelope.sequence, { envelope, expires: now() + 1000 });
    try {
      lease.window.webContents.send('keyboard-shortcuts:command', envelope);
      return true;
    } catch (error) {
      pending.delete(envelope.sequence);
      report(error);
      detach();
      return false;
    }
  }
  function admit(input) {
    const intent = parseReceiverIntent('admit', input);
    prune();
    const item = pending.get(intent.sequence);
    pending.delete(intent.sequence);
    const runtime = getRuntime(),
      current = lease;
    if (
      !item ||
      !alive(current) ||
      !current.armed ||
      intent.receiverId !== current.id ||
      intent.offerId !== current.offer.offerId ||
      item.envelope.contextRevision !== current.contextRevision ||
      item.envelope.generation !== runtime.generation ||
      runtime.busy ||
      runtime.state !== 'active'
    )
      return { status: 'stale' };
    const focus = role();
    return focus === 'blocked'
      ? { status: 'blocked' }
      : { status: 'admitted', role: focus };
  }
  return {
    connect,
    confirm,
    dispatch,
    admit,
    refresh,
    release(input) {
      const intent = parseReceiverIntent('release', input);
      if (lease?.id === intent.receiverId) detach();
      return { status: 'released' };
    },
    dispose() {
      disposed = true;
      detach();
    },
  };
}
module.exports = { createKeyboardShortcutReceiver };
