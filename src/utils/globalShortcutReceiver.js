import {
  parseReceiverOffer,
  parseGlobalShortcutEnvelope,
  ownsGlobalShortcut,
} from '../../shared/globalShortcutReceiver.mjs';
function bounded(work) {
  let timer;
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Error('Shortcut receiver timeout')),
        5000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

// Coordinates the existing executor; does not own playback, settings or a retry
// queue. Context renewal never queues/replays an operation.
export function createGlobalShortcutReceiver({
  bridge,
  commands,
  isBlocked = () => false,
  getRegistryRevision = () => 0,
  onOwnershipChange = () => {},
}) {
  let offer = null,
    disposed = false,
    confirmed = false,
    contextRevision = 1,
    uiRevision = 0,
    lastBoot = null,
    lastSequence = 0,
    confirming = false,
    dirty = false,
    boundReceiverId = null,
    sourceIdentity = commands.contextIdentity?.();
  let connecting = false,
    connectionRevision = 0;
  const supported = [
    'onKeyboardShortcutReceiverState',
    'onGlobalShortcutCommand',
    'connectKeyboardShortcutReceiver',
    'confirmKeyboardShortcutReceiver',
    'admitGlobalShortcut',
    'releaseKeyboardShortcutReceiver',
  ].every((name) => typeof bridge?.[name] === 'function');
  const invalidate = () => commands.invalidate('global');
  async function confirm() {
    if (
      disposed ||
      connecting ||
      !offer ||
      !offer.active.length ||
      offer.role === 'blocked'
    )
      return;
    if (confirming) {
      dirty = true;
      return;
    }
    confirming = true;
    dirty = false;
    confirmed = false;
    const sent = offer,
      revision = contextRevision;
    try {
      const reply = await bounded(() =>
        bridge.confirmKeyboardShortcutReceiver({
          receiverId: sent.receiverId,
          offerId: sent.offerId,
          contextRevision: revision,
        }),
      );
      if (
        disposed ||
        offer?.receiverId !== sent.receiverId ||
        offer.offerId !== sent.offerId
      )
        return;
      if (reply?.status === 'ready') {
        const next = parseReceiverOffer(reply.offer);
        if (
          next.receiverId !== sent.receiverId ||
          next.offerId !== sent.offerId ||
          next.bootId !== sent.bootId
        )
          return;
        offer = next;
        confirmed = revision === contextRevision;
      }
    } catch {
      /* No late result can enable this receiver after its local deadline. */
    } finally {
      confirming = false;
      if (dirty && !disposed) void confirm();
    }
  }
  function install(value) {
    if (disposed) return;
    try {
      const next = parseReceiverOffer(value);
      if (boundReceiverId && next.receiverId !== boundReceiverId) return;
      if (offer && JSON.stringify(next) === JSON.stringify(offer) && confirmed)
        return;
      const replaced =
        !offer ||
        offer.receiverId !== next.receiverId ||
        offer.offerId !== next.offerId ||
        offer.bootId !== next.bootId;
      offer = next;
      confirmed = false;
      contextRevision++;
      if (replaced) {
        uiRevision++;
        invalidate();
      }
      if (lastBoot !== offer.bootId) {
        lastBoot = offer.bootId;
        lastSequence = 0;
      }
      onOwnershipChange(Boolean(offer.active.length));
      return connecting ? undefined : confirm();
    } catch {
      offer = null;
      confirmed = false;
      uiRevision++;
      invalidate();
      onOwnershipChange(false);
    }
  }
  function contextChanged(ui = true) {
    if (disposed) return;
    contextRevision++;
    if (!ui) sourceIdentity = commands.contextIdentity?.();
    confirmed = false;
    if (ui) {
      uiRevision++;
      if (offer?.active.length) invalidate();
    }
    if (offer?.active.length) void confirm();
  }
  async function receive(value) {
    if (disposed || connecting || !offer) return false;
    if (commands.contextIdentity?.() !== sourceIdentity) contextChanged(false);
    let packet;
    try {
      packet = parseGlobalShortcutEnvelope(value);
    } catch {
      return false;
    }
    if (
      packet.bootId !== offer.bootId ||
      packet.receiverId !== offer.receiverId ||
      packet.offerId !== offer.offerId ||
      packet.sequence <= lastSequence
    )
      return false;
    lastSequence = packet.sequence;
    if (
      !confirmed ||
      packet.generation !== offer.generation ||
      packet.contextRevision !== contextRevision ||
      !offer.active.some((b) => b.command === packet.command) ||
      isBlocked(offer.role) ||
      !commands.canExecute(packet.command)
    )
      return false;
    const localUI = uiRevision,
      registry = getRegistryRevision(),
      revision = contextRevision,
      receiverId = offer.receiverId,
      offerId = offer.offerId;
    const current = (role) =>
      !disposed &&
      offer?.receiverId === receiverId &&
      offer.offerId === offerId &&
      uiRevision === localUI &&
      getRegistryRevision() === registry &&
      !isBlocked(role);
    try {
      const admitted = await bounded(() =>
        bridge.admitGlobalShortcut({
          receiverId,
          offerId,
          sequence: packet.sequence,
        }),
      );
      if (commands.contextIdentity?.() !== sourceIdentity)
        contextChanged(false);
      if (
        admitted?.status !== 'admitted' ||
        !['main', 'background'].includes(admitted.role) ||
        contextRevision !== revision ||
        !current(admitted.role)
      )
        return false;
      // Source revisions are admission barriers. Once execution starts, canonical
      // owner stamps guard its awaits; its own source/start changes do not cancel it.
      await commands.execute(packet.command, {
        scope: 'global',
        isCurrent: () => current(admitted.role),
      });
      return true;
    } catch {
      return false;
    }
  }
  const disposers = [];
  async function connect() {
    if (!supported || disposed) return false;
    const operation = ++connectionRevision;
    connecting = true;
    confirmed = false;
    boundReceiverId = null;
    uiRevision++;
    if (offer?.active.length) invalidate();
    try {
      const reply = await bounded(() =>
        bridge.connectKeyboardShortcutReceiver(),
      );
      if (disposed || operation !== connectionRevision) {
        if (reply?.offer?.receiverId)
          void bounded(() =>
            bridge.releaseKeyboardShortcutReceiver({
              receiverId: reply.offer.receiverId,
            }),
          ).catch(() => {});
        return false;
      }
      if (reply?.status !== 'offered') return false;
      const initial = parseReceiverOffer(reply.offer);
      boundReceiverId = initial.receiverId;
      if (!offer || offer.receiverId !== initial.receiverId) install(initial);
      connecting = false;
      await confirm();
      return true;
    } catch {
      return false;
    } finally {
      if (operation === connectionRevision) connecting = false;
    }
  }
  const ready = supported
    ? (() => {
        disposers.push(
          bridge.onKeyboardShortcutReceiverState(install),
          bridge.onGlobalShortcutCommand((value) => {
            void receive(value);
          }),
        );
        return connect();
      })()
    : Promise.resolve(false);
  return {
    ready,
    reconnect: connect,
    receive,
    contextChanged,
    contextRevision: () => contextRevision,
    owns: (event) => Boolean(offer && ownsGlobalShortcut(event, offer.active)),
    async dispose() {
      if (disposed) return;
      disposed = true;
      connectionRevision++;
      confirmed = false;
      uiRevision++;
      if (offer?.active.length) invalidate();
      for (const stop of disposers) stop?.();
      onOwnershipChange(false);
      if (offer && supported)
        try {
          await bounded(() =>
            bridge.releaseKeyboardShortcutReceiver({
              receiverId: offer.receiverId,
            }),
          );
        } catch {
          /* No release can revoke a newer receiver. */
        }
    },
  };
}
