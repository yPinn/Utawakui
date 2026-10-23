import {
  receiptHistoryAdvanced,
  receiptHistoryIdentity,
  receiptPageStarts,
  receiptRows,
} from '../../shared/presentation/receiptSetlist.mjs';

// All scheduled work belongs to this controller. Snapshot clocks never restart review.
export function createReceiptMotionController({
  gsap,
  list,
  render = () => {},
  measure,
  onPhase = () => {},
}) {
  let frame = null;
  let signature = '';
  let settings = {
    receiptDirection: 'down',
    receiptReview: 'on',
    receiptReviewInterval: 60,
  };
  let timer = null;
  let tween = null;
  let generation = 0;
  let suspended = false;
  let destroyed = false;
  let reduced = false;
  let reviewCursor = 1;
  let reviewing = false;

  function cancel() {
    generation += 1;
    clearTimeout(timer);
    timer = null;
    tween?.kill?.();
    tween = null;
    gsap?.killTweensOf?.(list);
    reviewing = false;
  }
  function geometry() {
    const measured = measure();
    return {
      rowHeight: Math.max(1, measured.rowHeight || 96),
      capacity: Math.max(1, measured.capacity || 1),
    };
  }
  function latestY() {
    const { rowHeight, capacity } = geometry();
    return settings.receiptDirection === 'up'
      ? (capacity - (frame?.history.length ?? 0)) * rowHeight
      : 0;
  }
  function setY(y) {
    if (gsap?.set) gsap.set(list, { y });
    else if (list?.style) list.style.transform = `translateY(${y}px)`;
  }
  function move(y, phase) {
    onPhase(phase);
    if (!reduced && gsap?.to) {
      const expected = generation;
      tween = gsap.to(list, {
        y,
        duration: phase === 'printing' ? 0.5 : 0.4,
        ease: 'power2.inOut',
        overwrite: true,
        onComplete: () => {
          if (!destroyed && generation === expected && phase === 'printing')
            onPhase('latest');
        },
      });
    } else setY(y);
  }
  function later(callback, milliseconds) {
    const expected = generation;
    timer = setTimeout(() => {
      timer = null;
      if (!destroyed && !suspended && generation === expected) callback();
    }, milliseconds);
  }
  function scheduleReview() {
    const { capacity } = geometry();
    if (
      destroyed ||
      suspended ||
      !frame ||
      settings.receiptReview !== 'on' ||
      frame.history.length <= capacity
    )
      return;
    later(startReview, settings.receiptReviewInterval * 1000);
  }
  function startReview() {
    const { rowHeight, capacity } = geometry();
    const pages = receiptPageStarts(
      frame.history.length,
      capacity,
      settings.receiptDirection,
    );
    if (pages.length < 2) return;
    reviewing = true;
    const start = reviewCursor >= pages.length ? 1 : reviewCursor;
    let index = start;
    let shown = 0;
    const next = () => {
      if (index >= pages.length || shown >= 3) {
        reviewCursor = index >= pages.length ? 1 : index;
        reviewing = false;
        // Reset directly at the boundary, never run backwards across the whole roll.
        setY(latestY());
        onPhase('latest');
        scheduleReview();
        return;
      }
      move(-pages[index] * rowHeight, 'reviewing');
      index += 1;
      shown += 1;
      later(next, 6000);
    };
    next();
  }
  function settle() {
    cancel();
    if (!frame || destroyed) return;
    render(frame, receiptRows(frame, settings.receiptDirection), settings);
    setY(latestY());
    onPhase('latest');
    scheduleReview();
  }

  return {
    update(next, { settle: recovering = false } = {}) {
      if (destroyed) return;
      const nextSignature = receiptHistoryIdentity(next);
      const advanced = receiptHistoryAdvanced(frame, next);
      const historyChanged = nextSignature !== signature;
      const wasReviewing = reviewing;
      frame = next;
      if (!historyChanged && !recovering) {
        render(frame, null, settings);
        return;
      }
      signature = nextSignature;
      cancel();
      render(frame, receiptRows(frame, settings.receiptDirection), settings);
      const target = latestY();
      if (advanced && !recovering && !suspended && !reduced) {
        // Reposition to the latest edge first if a review was interrupted.
        if (wasReviewing) setY(target);
        const { rowHeight } = geometry();
        setY(
          target +
            (settings.receiptDirection === 'up' ? rowHeight : -rowHeight),
        );
        move(target, 'printing');
      } else {
        setY(target);
        onPhase('latest');
      }
      scheduleReview();
    },
    configure(next = {}) {
      const configured = {
        receiptDirection: next.receiptDirection === 'up' ? 'up' : 'down',
        receiptReview: next.receiptReview === 'off' ? 'off' : 'on',
        receiptReviewInterval: Number.isFinite(next.receiptReviewInterval)
          ? Math.min(180, Math.max(30, next.receiptReviewInterval))
          : 60,
      };
      if (JSON.stringify(configured) === JSON.stringify(settings)) return;
      settings = configured;
      reviewCursor = 1;
      settle();
    },
    refresh: settle,
    setReducedMotion(value) {
      if (reduced === Boolean(value)) return;
      reduced = Boolean(value);
      settle();
    },
    suspend() {
      suspended = true;
      cancel();
    },
    resume() {
      if (destroyed) return;
      suspended = false;
      settle();
    },
    destroy() {
      destroyed = true;
      cancel();
    },
  };
}
