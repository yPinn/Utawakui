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
  setViewportHeight = () => {},
  onPhase = () => {},
}) {
  let frame = null;
  let signature = '';
  let settings = {
    receiptDirection: 'down',
    receiptReview: 'on',
    receiptReviewInterval: 15,
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
    const rowHeight = Math.max(1, measured.rowHeight || 96);
    const capacity = Math.max(1, measured.capacity || 1);
    return {
      rowHeight,
      totalHeight:
        measured.totalHeight ?? (frame?.history.length ?? 0) * rowHeight,
      feedHeight: measured.feedHeight || rowHeight,
      pages:
        measured.pages ??
        receiptPageStarts(
          frame?.history.length ?? 0,
          capacity,
          settings.receiptDirection,
        ).map((start) => ({
          y: start === 0 ? 0 : -start * rowHeight,
          height:
            Math.min(capacity, (frame?.history.length ?? 0) - start) *
            rowHeight,
        })),
    };
  }
  function usePage(page) {
    if (Number.isFinite(page.height)) setViewportHeight(page.height);
    return page.y;
  }
  function latestY() {
    return usePage(geometry().pages[0]);
  }
  function setY(y) {
    if (gsap?.set) gsap.set(list, { y });
    else if (list?.style) list.style.transform = `translateY(${y}px)`;
  }
  function move(y, phase, onComplete, options = {}) {
    onPhase(phase);
    const expected = generation;
    const complete = () => {
      if (destroyed || suspended || generation !== expected) return;
      if (phase === 'printing') onPhase('latest');
      onComplete?.();
    };
    if (!reduced && gsap?.to) {
      tween = gsap.to(list, {
        y,
        duration: options.duration ?? (phase === 'printing' ? 0.5 : 0.4),
        ease: options.ease ?? 'power2.inOut',
        overwrite: true,
        onComplete: complete,
      });
    } else {
      setY(y);
      complete();
    }
  }
  function later(callback, milliseconds) {
    const expected = generation;
    timer = setTimeout(() => {
      timer = null;
      if (!destroyed && !suspended && generation === expected) callback();
    }, milliseconds);
  }
  function scheduleReview() {
    if (
      destroyed ||
      suspended ||
      !frame ||
      settings.receiptReview !== 'on' ||
      geometry().pages.length < 2
    )
      return;
    later(startReview, settings.receiptReviewInterval * 1000);
  }
  function startReview() {
    const { pages, rowHeight, totalHeight } = geometry();
    if (pages.length < 2) return;
    reviewing = true;
    const start = reviewCursor >= pages.length ? 1 : reviewCursor;
    const end = Math.min(start + 2, pages.length - 1);
    const latest = pages[0];
    const minimumY = Math.min(0, latest.height - totalHeight);
    const target = Math.min(0, Math.max(minimumY, pages[end].y));
    const duration = Math.min(
      6,
      Math.max(0.8, Math.abs(target - latest.y) / (rowHeight * 1.5)),
    );
    const options = { duration, ease: 'none' };
    // Keep the same rows and viewport throughout both continuous passes.
    move(
      target,
      'reviewing',
      () => {
        later(() => {
          move(
            latest.y,
            'returning',
            () => {
              reviewCursor = end === pages.length - 1 ? 1 : end + 1;
              reviewing = false;
              onPhase('latest');
              scheduleReview();
            },
            options,
          );
        }, 1000);
      },
      options,
    );
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
        const { feedHeight } = geometry();
        setY(
          target +
            (settings.receiptDirection === 'up' ? feedHeight : -feedHeight),
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
          ? Math.min(60, Math.max(5, next.receiptReviewInterval))
          : 15,
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
