const HISTORY_PAGE_FILL_RATIO = 0.84;
const HISTORY_PAGE_HOLD_SECONDS = 4;
const HISTORY_PAGE_MOVE_SECONDS = 0.45;
const HISTORY_FADE_OUT_SECONDS = 0.16;
const HISTORY_FADE_IN_SECONDS = 0.24;
const HISTORY_ROW_ENTER_SECONDS = 0.28;
const REDUCED_HISTORY_HOLD_SECONDS = 6;
const REDUCED_HISTORY_FADE_OUT_SECONDS = 0.12;
const REDUCED_HISTORY_FADE_IN_SECONDS = 0.18;
const CURRENT_EXIT_SECONDS = 0.16;
const CURRENT_ENTER_SECONDS = 0.26;
const REDUCED_CURRENT_EXIT_SECONDS = 0.12;
const REDUCED_CURRENT_ENTER_SECONDS = 0.18;
const CURRENT_CLEAR_PROPS = 'opacity,transform,visibility,willChange';
const HISTORY_CLEAR_PROPS = 'opacity,transform,visibility,willChange';

function nonNegativeFinite(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function roundedDistance(value) {
  return Math.round(value * 100) / 100;
}

function currentTrackIdentity(frame) {
  const current = frame?.current;
  if (!current) return '';
  return (
    String(current.trackId ?? '').trim() ||
    `${String(current.title ?? '')}\u001f${String(current.artist ?? '')}`
  );
}

export function setlistHistoryPageOffsets({
  contentHeight = 0,
  viewportHeight = 0,
  rowOffsets = [],
} = {}) {
  const safeContentHeight = nonNegativeFinite(contentHeight);
  const safeViewportHeight = nonNegativeFinite(viewportHeight);
  const maxDistance = roundedDistance(
    Math.max(0, safeContentHeight - safeViewportHeight),
  );
  if (maxDistance === 0 || safeViewportHeight === 0) return [0];

  const alignedOffsets = [
    ...new Set(
      rowOffsets
        .filter(Number.isFinite)
        .map((offset) => roundedDistance(Math.max(0, offset)))
        .filter((offset) => offset > 0 && offset < maxDistance),
    ),
  ].sort((left, right) => left - right);
  const maximumAdvance = safeViewportHeight * HISTORY_PAGE_FILL_RATIO;
  const pages = [0];
  let currentOffset = 0;

  while (currentOffset < maxDistance) {
    if (maxDistance - currentOffset <= maximumAdvance) {
      pages.push(maxDistance);
      break;
    }

    const limit = currentOffset + maximumAdvance;
    const rowAligned = alignedOffsets.filter(
      (offset) => offset > currentOffset && offset <= limit,
    );
    const nextOffset =
      rowAligned.at(-1) ?? roundedDistance(Math.min(limit, maxDistance));
    if (nextOffset <= currentOffset) {
      pages.push(maxDistance);
      break;
    }
    pages.push(nextOffset);
    currentOffset = nextOffset;
  }

  return [...new Set(pages)];
}

export function createSetlistCurrentMotionController({
  commitFrame = () => undefined,
  current,
  gsap,
  root,
} = {}) {
  let destroyed = false;
  let displayedTrackIdentity = '';
  let pendingFrame = null;
  let presented = false;
  let reducedMotion = false;
  let suspended = false;
  let targetTrackIdentity = '';
  let transition = null;

  function setMotionState(value) {
    if (root?.dataset) root.dataset.currentMotion = value;
  }

  function clearCurrentMotion() {
    gsap?.killTweensOf?.(current);
    gsap?.set?.(current, { clearProps: CURRENT_CLEAR_PROPS });
  }

  function killTransition() {
    transition?.kill?.();
    transition = null;
    clearCurrentMotion();
  }

  function commitPendingFrame() {
    if (!pendingFrame) return;
    const frame = pendingFrame;
    pendingFrame = null;
    commitFrame(frame);
    displayedTrackIdentity = currentTrackIdentity(frame);
    targetTrackIdentity = displayedTrackIdentity;
  }

  function settle() {
    transition = null;
    clearCurrentMotion();
    setMotionState('idle');
  }

  function canAnimate() {
    return (
      !suspended &&
      current &&
      typeof gsap?.timeline === 'function' &&
      typeof gsap?.set === 'function'
    );
  }

  function update(frame) {
    if (destroyed) return;
    const nextTrackIdentity = currentTrackIdentity(frame);

    if (!presented) {
      presented = true;
      pendingFrame = frame;
      commitPendingFrame();
      clearCurrentMotion();
      setMotionState('idle');
      return;
    }

    if (transition && nextTrackIdentity === targetTrackIdentity) {
      pendingFrame = frame;
      if (displayedTrackIdentity === targetTrackIdentity) {
        commitPendingFrame();
      }
      return;
    }

    if (nextTrackIdentity === displayedTrackIdentity || !canAnimate()) {
      killTransition();
      pendingFrame = frame;
      commitPendingFrame();
      setMotionState('idle');
      return;
    }

    killTransition();
    pendingFrame = frame;
    targetTrackIdentity = nextTrackIdentity;
    const hasOutgoingTrack = Boolean(displayedTrackIdentity);
    const hasIncomingTrack = Boolean(nextTrackIdentity);
    const handoffAt = hasOutgoingTrack
      ? reducedMotion
        ? REDUCED_CURRENT_EXIT_SECONDS
        : CURRENT_EXIT_SECONDS
      : 0;
    setMotionState('switching');
    gsap.set(current, { willChange: 'opacity, transform' });
    transition = gsap.timeline({ onComplete: settle });

    if (hasOutgoingTrack) {
      transition.to(
        current,
        {
          autoAlpha: 0,
          duration: reducedMotion
            ? REDUCED_CURRENT_EXIT_SECONDS
            : CURRENT_EXIT_SECONDS,
          ease: 'power2.in',
          ...(reducedMotion ? {} : { y: -6 }),
        },
        0,
      );
    }

    transition.call(commitPendingFrame, null, handoffAt);

    if (hasIncomingTrack) {
      const fromVars = {
        autoAlpha: 0,
        ...(reducedMotion ? {} : { y: 8 }),
      };
      const toVars = {
        autoAlpha: 1,
        clearProps: CURRENT_CLEAR_PROPS,
        duration: reducedMotion
          ? REDUCED_CURRENT_ENTER_SECONDS
          : CURRENT_ENTER_SECONDS,
        ease: 'power3.out',
        immediateRender: false,
        ...(reducedMotion ? {} : { y: 0 }),
      };
      transition.fromTo(current, fromVars, toVars, handoffAt);
    }
  }

  function setReducedMotion(value) {
    const next = value === true;
    if (reducedMotion === next) return;
    reducedMotion = next;
    if (!transition) return;
    killTransition();
    commitPendingFrame();
    setMotionState('idle');
  }

  function suspend() {
    if (destroyed || suspended) return;
    suspended = true;
    transition?.pause?.();
  }

  function resume() {
    if (destroyed || !suspended) return;
    suspended = false;
    transition?.play?.();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    pendingFrame = null;
    killTransition();
    setMotionState('idle');
  }

  return { destroy, resume, setReducedMotion, suspend, update };
}

export function createSetlistHistoryMotionController({
  gsap,
  list,
  root,
  viewport,
} = {}) {
  let destroyed = false;
  let geometrySignature = '';
  let historyEntryTween = null;
  let historyTimeline = null;
  let measured = false;
  let reducedMotion = false;
  let suspended = false;

  if (root?.dataset) {
    root.dataset.historyOverflow = 'false';
    root.dataset.historyMotion = 'static';
  }

  function canAnimate() {
    return (
      list &&
      viewport &&
      typeof gsap?.timeline === 'function' &&
      typeof gsap?.set === 'function'
    );
  }

  function rows() {
    return Array.from(list?.children ?? []);
  }

  function clearOwnedMotion() {
    historyTimeline?.kill?.();
    historyTimeline = null;
    historyEntryTween?.kill?.();
    historyEntryTween = null;
    const ownedRows = rows();
    gsap?.killTweensOf?.([list, ...ownedRows]);
    gsap?.set?.(list, { clearProps: HISTORY_CLEAR_PROPS });
    if (ownedRows.length > 0) {
      gsap?.set?.(ownedRows, { clearProps: HISTORY_CLEAR_PROPS });
    }
  }

  function revealLatestRow() {
    const newestRow = rows().at(-1);
    if (!newestRow || typeof gsap?.fromTo !== 'function') return;
    historyEntryTween = gsap.fromTo(
      newestRow,
      {
        autoAlpha: 0,
        ...(reducedMotion ? {} : { x: -6 }),
      },
      {
        autoAlpha: 1,
        clearProps: HISTORY_CLEAR_PROPS,
        duration: reducedMotion
          ? REDUCED_HISTORY_FADE_IN_SECONDS
          : HISTORY_ROW_ENTER_SECONDS,
        ease: 'power3.out',
        onComplete: () => {
          historyEntryTween = null;
        },
        overwrite: 'auto',
        ...(reducedMotion ? {} : { x: 0 }),
      },
    );
  }

  function measurePageOffsets() {
    const listTop = list?.getBoundingClientRect?.().top ?? 0;
    return setlistHistoryPageOffsets({
      contentHeight: list?.scrollHeight ?? 0,
      viewportHeight: viewport?.clientHeight ?? 0,
      rowOffsets: rows().map(
        (row) => (row.getBoundingClientRect?.().top ?? listTop) - listTop,
      ),
    });
  }

  function addFadeReset(timeline, holdSeconds) {
    timeline.to(
      list,
      {
        autoAlpha: 0,
        duration: reducedMotion
          ? REDUCED_HISTORY_FADE_OUT_SECONDS
          : HISTORY_FADE_OUT_SECONDS,
        ease: 'power1.in',
      },
      `+=${holdSeconds}`,
    );
    timeline.set(list, { y: 0 }, '>');
    timeline.to(
      list,
      {
        autoAlpha: 1,
        duration: reducedMotion
          ? REDUCED_HISTORY_FADE_IN_SECONDS
          : HISTORY_FADE_IN_SECONDS,
        ease: 'power2.out',
      },
      '>',
    );
  }

  function buildLoop(pageOffsets) {
    if (destroyed || pageOffsets.length < 2 || !canAnimate()) return;
    const holdSeconds = reducedMotion
      ? REDUCED_HISTORY_HOLD_SECONDS
      : HISTORY_PAGE_HOLD_SECONDS;
    historyTimeline = gsap.timeline({
      paused: suspended,
      repeat: -1,
    });
    historyTimeline.set(list, { autoAlpha: 1, y: 0 }, 0);

    for (const offset of pageOffsets.slice(1)) {
      if (reducedMotion) {
        historyTimeline.to(
          list,
          {
            autoAlpha: 0,
            duration: REDUCED_HISTORY_FADE_OUT_SECONDS,
            ease: 'power1.in',
          },
          `+=${holdSeconds}`,
        );
        historyTimeline.set(list, { y: -offset }, '>');
        historyTimeline.to(
          list,
          {
            autoAlpha: 1,
            duration: REDUCED_HISTORY_FADE_IN_SECONDS,
            ease: 'power2.out',
          },
          '>',
        );
      } else {
        historyTimeline.to(
          list,
          {
            duration: HISTORY_PAGE_MOVE_SECONDS,
            ease: 'power2.inOut',
            y: -offset,
          },
          `+=${holdSeconds}`,
        );
      }
    }

    addFadeReset(historyTimeline, holdSeconds);
  }

  function buildLatestReveal(pageOffsets) {
    if (destroyed || !canAnimate()) return;
    const newestRow = rows().at(-1);
    const lastOffset = pageOffsets.at(-1) ?? 0;
    historyTimeline = gsap.timeline({
      onComplete: () => {
        historyTimeline = null;
        buildLoop(pageOffsets);
      },
      paused: suspended,
    });
    historyTimeline.set(
      list,
      { autoAlpha: reducedMotion ? 0 : 1, y: -lastOffset },
      0,
    );
    if (reducedMotion) {
      historyTimeline.to(
        list,
        {
          autoAlpha: 1,
          duration: REDUCED_HISTORY_FADE_IN_SECONDS,
          ease: 'power2.out',
        },
        0,
      );
    }
    if (newestRow) {
      historyTimeline.fromTo(
        newestRow,
        {
          autoAlpha: 0,
          ...(reducedMotion ? {} : { x: -6 }),
        },
        {
          autoAlpha: 1,
          clearProps: HISTORY_CLEAR_PROPS,
          duration: reducedMotion
            ? REDUCED_HISTORY_FADE_IN_SECONDS
            : HISTORY_ROW_ENTER_SECONDS,
          ease: 'power3.out',
          immediateRender: false,
          ...(reducedMotion ? {} : { x: 0 }),
        },
        0,
      );
    }
    addFadeReset(
      historyTimeline,
      reducedMotion ? REDUCED_HISTORY_HOLD_SECONDS : HISTORY_PAGE_HOLD_SECONDS,
    );
  }

  function refresh({ force = false, revealLatest = false } = {}) {
    if (destroyed) return;
    measured = true;
    const pageOffsets = measurePageOffsets();
    const overflow = pageOffsets.length > 1;
    if (root?.dataset) {
      root.dataset.historyOverflow = String(overflow);
      root.dataset.historyMotion = overflow
        ? reducedMotion
          ? 'reduced'
          : 'paging'
        : 'static';
    }
    const nextSignature = `${pageOffsets.join(',')}|${reducedMotion}`;
    if (!force && !revealLatest && nextSignature === geometrySignature) return;
    geometrySignature = nextSignature;
    clearOwnedMotion();

    if (!canAnimate()) return;
    if (!overflow) {
      if (revealLatest) revealLatestRow();
      return;
    }

    gsap.set(list, { willChange: 'opacity, transform' });
    if (revealLatest) {
      buildLatestReveal(pageOffsets);
      return;
    }
    buildLoop(pageOffsets);
  }

  function setReducedMotion(value) {
    const next = value === true;
    if (reducedMotion === next) return;
    reducedMotion = next;
    if (measured) refresh({ force: true });
  }

  function suspend() {
    if (destroyed || suspended) return;
    suspended = true;
    historyTimeline?.pause?.();
    historyEntryTween?.pause?.();
  }

  function resume() {
    if (destroyed || !suspended) return;
    suspended = false;
    historyTimeline?.play?.();
    historyEntryTween?.play?.();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearOwnedMotion();
    if (root?.dataset) {
      root.dataset.historyOverflow = 'false';
      root.dataset.historyMotion = 'static';
    }
  }

  return { destroy, refresh, resume, setReducedMotion, suspend };
}
