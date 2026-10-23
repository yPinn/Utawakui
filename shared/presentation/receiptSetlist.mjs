import { selectSetlistFrame } from './state.mjs';

const track = (value, ordinal) => ({
  ordinal,
  trackId: String(value?.id ?? ''),
  title: String(value?.title ?? ''),
  artist: String(value?.artist ?? ''),
});

export function selectReceiptSetlistFrame(snapshot) {
  const base = selectSetlistFrame(snapshot);
  const receipt = snapshot?.queue?.receipt;
  const countIsComplete =
    Number.isSafeInteger(receipt?.completedCount) &&
    Array.isArray(receipt?.history);
  const history = countIsComplete
    ? receipt.history
        .slice(-100)
        .map((item) => track(item.track, item.ordinal))
        .filter((item) => item.title)
    : base.history.map((item, index) => ({ ...item, ordinal: index + 1 }));
  return {
    ...base,
    visible: Boolean(
      base.current ||
      history.length ||
      (countIsComplete && receipt.completedCount),
    ),
    history,
    completedCount: countIsComplete ? receipt.completedCount : history.length,
    countIsComplete,
  };
}

export function receiptRows(frame, direction = 'down') {
  const rows = [...(frame?.history ?? [])];
  return direction === 'up' ? rows : rows.reverse();
}

export function receiptPageStarts(count, capacity, direction = 'down') {
  if (capacity < 1 || count <= capacity) return [0];
  const last = count - capacity;
  const pages = [];
  if (direction === 'up') {
    for (let start = last; start > 0; start -= capacity) pages.push(start);
    pages.push(0);
  } else {
    for (let start = 0; start < last; start += capacity) pages.push(start);
    pages.push(last);
  }
  return pages;
}

export function receiptHistoryIdentity(frame) {
  return JSON.stringify([
    frame?.sourceName,
    frame?.completedCount,
    frame?.history ?? [],
  ]);
}

export function receiptHistoryAdvanced(previous, next) {
  if (previous?.countIsComplete === false || next.countIsComplete === false)
    return false;
  if (
    !previous ||
    previous.sourceName !== next.sourceName ||
    next.completedCount !== previous.completedCount + 1
  )
    return false;
  const retained = next.history.filter(
    (row) => row.ordinal <= previous.completedCount,
  );
  if (retained.length === 0) return previous.completedCount === 0;
  const previousByOrdinal = new Map(
    previous.history.map((row) => [row.ordinal, row]),
  );
  return retained.every((row) => {
    const old = previousByOrdinal.get(row.ordinal);
    return (
      old &&
      old.trackId === row.trackId &&
      old.title === row.title &&
      old.artist === row.artist
    );
  });
}
