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

export function receiptPageLayout(heights, available, direction = 'down') {
  const offsets = [0];
  for (const height of heights) offsets.push(offsets.at(-1) + height);
  const pages = [];
  const add = (start, end) =>
    pages.push({
      y: offsets[start] === 0 ? 0 : -offsets[start],
      height: Math.min(available, offsets[end] - offsets[start]),
    });
  if (direction === 'up') {
    let end = heights.length;
    while (end > 0) {
      let start = end - 1;
      while (start > 0 && offsets[end] - offsets[start - 1] <= available + 0.5)
        start -= 1;
      add(start, end);
      end = start;
    }
  } else {
    let start = 0;
    while (start < heights.length) {
      let end = start + 1;
      while (
        end < heights.length &&
        offsets[end + 1] - offsets[start] <= available + 0.5
      )
        end += 1;
      add(start, end);
      start = end;
    }
  }
  return pages.length ? pages : [{ y: 0, height: 0 }];
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
