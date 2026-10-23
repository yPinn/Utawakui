const CLEAR_PROPS = 'opacity,visibility,willChange';

function identity(frame) {
  return frame?.visible === true ? frame.trackId || '' : '';
}

// Only artwork and metadata fade. Transport, clock and volume stay live.
export function createCoverPlayerMotionController({
  gsap = null,
  root,
  current,
  commitFrame = () => {},
  commitPlayback = () => {},
  prepareFrame = () => {},
  clearPreparedFrame = () => {},
} = {}) {
  let active = false;
  let destroyed = false;
  let suspended = false;
  let reduced = false;
  let displayed = null;
  let latest = null;
  let target = '';
  let transition = null;
  let generation = 0;

  function phase(value) {
    if (root?.dataset) root.dataset.coverMotion = value;
  }

  function clear() {
    gsap?.set?.(current, { clearProps: CLEAR_PROPS });
  }

  function stop(reset = true) {
    generation += 1;
    transition?.kill();
    transition = null;
    gsap?.killTweensOf?.(current);
    if (reset) clear();
    clearPreparedFrame();
    phase('idle');
  }

  function commit() {
    if (!latest) return;
    commitFrame(latest);
    displayed = latest;
  }

  function settle() {
    stop();
    commit();
  }

  function update(frame, options = {}) {
    if (destroyed) return;
    active = options.active === true;
    if (!active) {
      stop();
      latest = null;
      displayed = null;
      return;
    }
    latest = frame;
    if (suspended) return;
    commitPlayback(frame);
    const next = identity(frame);
    if (
      options.settle ||
      reduced ||
      !identity(displayed) ||
      !next ||
      !current?.length ||
      !gsap?.timeline ||
      !gsap?.set
    ) {
      settle();
      return;
    }
    if (transition && next === target) {
      if (identity(displayed) === target) commit();
      return;
    }
    if (next === identity(displayed)) {
      if (transition) stop();
      commit();
      return;
    }

    // Preserve the current opacity when a new song interrupts an old fade.
    stop(false);
    target = next;
    prepareFrame(frame);
    const expected = generation;
    const valid = () =>
      !destroyed && active && !suspended && generation === expected;
    phase('out');
    gsap.set(current, { willChange: 'opacity' });
    transition = gsap.timeline({
      onComplete() {
        if (!valid()) return;
        transition = null;
        clearPreparedFrame();
        clear();
        phase('idle');
      },
    });
    transition.to(
      current,
      { autoAlpha: 0, duration: 0.16, ease: 'power2.in' },
      0,
    );
    transition.call(
      () => {
        if (!valid()) return;
        commit();
        phase('in');
      },
      null,
      0.16,
    );
    transition.to(
      current,
      { autoAlpha: 1, duration: 0.24, ease: 'power3.out' },
      0.16,
    );
  }

  function setReducedMotion(value) {
    reduced = value === true;
    if (reduced && transition) settle();
  }

  function suspend() {
    suspended = true;
    stop();
  }

  function resume() {
    if (!suspended || destroyed) return;
    suspended = false;
    if (active && latest) update(latest, { active: true, settle: true });
  }

  function destroy() {
    destroyed = true;
    latest = null;
    stop();
  }

  return { update, setReducedMotion, suspend, resume, destroy };
}
