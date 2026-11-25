import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger, CustomEase);

// Dev-only handle for inspecting triggers from the console or a probe.
if (import.meta.env.DEV) Object.assign(window, { gsap, ScrollTrigger });

const tokenValue = (name) =>
  getComputedStyle(document.body).getPropertyValue(name).trim();

// Builds a GSAP ease from an app cubic-bezier token so site motion matches the product.
function tokenEase(name, fallback) {
  const points = tokenValue(name).match(/cubic-bezier\(([^)]+)\)/)?.[1];
  return points ? CustomEase.create(name.slice(2), points) : fallback;
}

function tokenSeconds(name, fallback) {
  const value = tokenValue(name);
  const ms = value.endsWith('ms')
    ? parseFloat(value)
    : parseFloat(value) * 1000;
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : fallback;
}

// The app forbids bounce and overshoot: arrivals decelerate, in-place changes use standard.
export const EASE_ENTER = tokenEase('--ui-motion-easing-enter', 'power4.out');
export const EASE_STANDARD = tokenEase(
  '--ui-motion-easing-standard',
  'power3.inOut',
);
export const DURATION_STANDARD = tokenSeconds(
  '--ui-motion-duration-standard',
  0.2,
);
export const DURATION_SLOW = tokenSeconds('--ui-motion-duration-slow', 0.28);

export const MEDIA = {
  full: '(prefers-reduced-motion: no-preference)',
  reduced: '(prefers-reduced-motion: reduce)',
};

export function useWheelScroll(root, viewport) {
  const mm = gsap.matchMedia();
  mm.add(MEDIA.full, () => {
    let destination;
    let lastTop = viewport.scrollTop;
    const position = { top: lastTop };
    const glide = gsap.quickTo(position, 'top', {
      duration: DURATION_SLOW,
      ease: EASE_ENTER,
      onUpdate() {
        if (viewport.scrollTop !== lastTop) {
          stop();
          return;
        }
        viewport.scrollTop = position.top;
        const top = viewport.scrollTop;
        if (top !== lastTop) {
          lastTop = top;
          // The browser dispatches scroll on a later frame.
          ScrollTrigger.update();
        }
      },
      onComplete: () => (destination = undefined),
    });

    function stop() {
      destination = undefined;
      glide.tween.pause();
    }

    function onWheel(event) {
      // Read deltaMode first so the browser reports deltas in the declared units.
      const mode = event.deltaMode;
      const { deltaX, deltaY } = event;
      if (
        event.defaultPrevented ||
        !event.cancelable ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        Math.abs(deltaX) >= Math.abs(deltaY)
      ) {
        stop();
        return;
      }

      const top = viewport.scrollTop;
      const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const unit =
        mode === 1
          ? parseFloat(getComputedStyle(viewport).lineHeight) || 16
          : mode === 2
            ? viewport.clientHeight
            : 1;
      // Accumulate same-direction input. Reverse from the visible position.
      const pending = destination ?? top;
      const base =
        top === lastTop && (pending - top) * deltaY > 0 ? pending : top;
      const next = gsap.utils.clamp(0, max, base + deltaY * unit);
      if (next === top) {
        stop();
        return;
      }

      event.preventDefault();
      if (next !== destination || top !== lastTop) {
        destination = next;
        lastTop = top;
        glide(next, top);
      }
    }

    const listeners = new AbortController();
    const { signal } = listeners;
    root.addEventListener('wheel', onWheel, { passive: false, signal });
    root.addEventListener('pointerdown', stop, { capture: true, signal });
    root.addEventListener('click', stop, { capture: true, signal });
    window.addEventListener('keydown', stop, { capture: true, signal });
    window.addEventListener('popstate', stop, { signal });
    return () => listeners.abort();
  });
  return () => mm.revert();
}

const REST_STATE = { autoAlpha: 1, x: 0, y: 0, scale: 1 };

// One-shot entrance per element as it scrolls into view; never replays on scroll-back.
// Pass elements (not selector text) so every element gets its own trigger.
export function reveal(scroller, targets, vars = {}) {
  const {
    duration = DURATION_SLOW * 2,
    ease = EASE_ENTER,
    stagger = 0.06,
    start = 'top 85%',
    ...from
  } = vars;
  const elements = gsap.utils.toArray(targets);
  const startState = { autoAlpha: 0, y: 24, ...from };
  // Animate back only the properties we moved.
  const endState = Object.fromEntries(
    Object.keys(startState).map((key) => [key, REST_STATE[key]]),
  );
  return ScrollTrigger.batch(elements, {
    scroller,
    start,
    once: true,
    onEnter: (batch) =>
      gsap.fromTo(batch, startState, {
        ...endState,
        duration,
        ease,
        stagger,
        overwrite: true,
      }),
  });
}

// Runs setup only for full motion and reverts every tween and trigger on unmount.
export function useSectionMotion(scope, setup) {
  // The scroll viewport is outside the section's GSAP selector scope.
  const scroller = scope.closest('.site-scroll__viewport');
  const mm = gsap.matchMedia(scope);
  mm.add(MEDIA.full, () => setup(scroller));
  return () => mm.revert();
}

export { gsap, ScrollTrigger };
