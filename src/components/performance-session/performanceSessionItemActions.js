import { nextTick } from 'vue';
import { Copy, SkipForward, Trash2 } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';

function removeLabel(history) {
  return t(
    history ? 'session.planList.removeRecord' : 'session.pendingMenu.remove',
  );
}

export function confirmPerformanceSessionItemRemoval(confirm, item) {
  const history = item.progress !== 'queued';
  return confirm({
    title: t(
      history
        ? 'session.workspace.removeHistoryTitle'
        : 'session.workspace.removeQueuedTitle',
    ),
    subject: item.displayTitle,
    message: t('session.workspace.removeMessage'),
    confirmLabel: removeLabel(history),
    intent: 'danger',
  });
}

export function performanceSessionItemMenu({ history = false, disabled }) {
  const groups = [
    {
      id: 'manage',
      items: [
        {
          id: 'duplicate',
          kind: 'action',
          label: t(
            history
              ? 'session.planList.requeue'
              : 'session.pendingMenu.duplicate',
          ),
          value: 'duplicate',
          icon: Copy,
          disabled,
        },
      ],
    },
    {
      id: 'destructive',
      items: [
        {
          id: 'remove',
          kind: 'action',
          label: removeLabel(history),
          value: 'remove',
          icon: Trash2,
          intent: 'danger',
          disabled,
        },
      ],
    },
  ];
  if (!history) {
    groups.unshift({
      id: 'playback',
      items: [
        {
          id: 'skip',
          kind: 'action',
          label: t('session.pendingMenu.skip'),
          value: 'skip',
          icon: SkipForward,
          disabled,
        },
      ],
    });
  }
  return { kind: 'actions', groups };
}

export async function moveFocusedSessionRow(
  event,
  moveItem,
  itemId,
  index,
  count,
) {
  if (
    !moveItem ||
    !event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.metaKey ||
    event.defaultPrevented ||
    event.isComposing
  )
    return;
  const offset =
    event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  if (!offset || index + offset < 0 || index + offset >= count) return;

  const button = event.currentTarget;
  const ownerDocument = button?.ownerDocument;
  const hadFocus = ownerDocument?.activeElement === button;
  event.preventDefault();
  event.stopPropagation();
  await moveItem(itemId, offset);
  await nextTick();
  if (
    hadFocus &&
    button?.isConnected &&
    ownerDocument.activeElement === ownerDocument.body
  ) {
    button.focus({ preventScroll: true });
  }
}
