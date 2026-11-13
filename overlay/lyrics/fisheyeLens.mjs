import { createFisheyePainter } from '../../shared/browser/fisheyePaint.mjs';
import {
  createFisheyeMotion,
  FISHEYE_LAYOUT_DURATION_MS,
} from '../../shared/browser/fisheyeMotion.mjs';
import {
  fisheyeLyricsColumns,
  resolveFisheyeExit,
  resolveFisheyeLayout,
} from '../../shared/presentation/fisheyeLyrics.mjs';

const views = new WeakMap();

export function clearFisheyeLens(elements) {
  const view = views.get(elements.root);
  if (!view) return;
  view.dispose();
  elements.fisheye.hidden = true;
  delete elements.fisheye.dataset.fisheyeVariant;
  delete elements.fisheye.dataset.fisheyeLayout;
  elements.fisheye.removeAttribute('aria-label');
  views.delete(elements.root);
}

function createView(canvas, gsap) {
  const painter = createFisheyePainter(canvas);
  const motion = createFisheyeMotion(gsap);
  const window = canvas.ownerDocument.defaultView;
  let animation = null;
  let lastText;
  let columns;
  let currentMix;
  let targetMix;
  let previousCameraKey;
  let previousMode;
  let camera;

  function stop() {
    if (animation !== null) window.cancelAnimationFrame(animation);
    animation = null;
  }

  function update(
    text,
    timing,
    animate,
    appearance,
    reflectionClock,
    reducedMotion,
    framing,
  ) {
    stop();
    if (lastText !== text) {
      columns = fisheyeLyricsColumns(text);
      lastText = text;
    }
    const started = window.performance.now();
    const { lensLayout, mode, changedAt, canMove, settle } = framing;
    const target = lensLayout === 'close' ? 1 : 0;
    const cameraKey = mode === 'auto' ? `${target}:${changedAt}` : mode;
    if (
      settle ||
      currentMix === undefined ||
      (!canMove && cameraKey !== previousCameraKey)
    ) {
      currentMix = target;
      camera = null;
    } else if (
      canMove &&
      cameraKey !== previousCameraKey &&
      camera?.target !== target
    ) {
      const authored =
        mode === 'auto' &&
        previousMode === 'auto' &&
        Number.isFinite(changedAt);
      camera =
        currentMix === target
          ? null
          : {
              from: currentMix,
              target,
              at: authored ? changedAt : started,
              authored,
            };
    }
    if (camera && !camera.authored) {
      if (canMove && camera.pausedAt !== undefined) {
        camera.at += started - camera.pausedAt;
        delete camera.pausedAt;
      } else if (!canMove) {
        camera.pausedAt ??= started;
      }
    }
    previousCameraKey = cameraKey;
    previousMode = mode;
    targetMix = target;
    const { ageMs, durationMs } = timing;
    const hasMotion =
      animate &&
      text &&
      (appearance?.fisheyePulse !== 0 ||
        appearance?.fisheyeEnter !== 'cut' ||
        appearance?.fisheyeExit !== 'cut');
    const animateReflection =
      !reducedMotion &&
      reflectionClock?.playing &&
      appearance?.fisheyeReflection !== 0;
    function paint(now) {
      const elapsed = Math.max(0, now - started);
      const age = ageMs + (animate ? elapsed : 0);
      const reflectionPositionMs = reducedMotion
        ? undefined
        : reflectionClock?.positionMs +
          (animateReflection ? elapsed * reflectionClock.rate : 0);
      if (camera && (canMove || camera.authored)) {
        const cameraPosition = camera.authored
          ? reflectionClock.positionMs +
            (canMove ? elapsed * reflectionClock.rate : 0)
          : now;
        const duration = camera.target
          ? FISHEYE_LAYOUT_DURATION_MS.push
          : FISHEYE_LAYOUT_DURATION_MS.pull;
        const mix = motion.layoutMix({
          target: 1,
          elapsedMs: cameraPosition - camera.at,
          durationMs: duration,
        });
        currentMix = camera.from + (camera.target - camera.from) * mix;
        if (mix >= 1) camera = null;
      } else if (!camera) currentMix = targetMix;
      const pose = motion.lyricPose({
        ageMs: age,
        durationMs,
        animate,
        enter: appearance?.fisheyeEnter,
        exit: appearance?.fisheyeExit,
        blur: appearance?.fisheyeBlur === 'on',
      });
      painter.render(
        columns,
        {
          ...pose,
          layoutMix: currentMix,
          reducedMotion: !animate,
          reflectionPositionMs: Number.isFinite(reflectionPositionMs)
            ? reflectionPositionMs
            : undefined,
        },
        appearance,
      );
      if (
        (camera && canMove) ||
        animateReflection ||
        (hasMotion && age < durationMs)
      ) {
        animation = window.requestAnimationFrame(paint);
      }
    }
    paint(started);
  }

  return {
    update,
    dispose() {
      stop();
      motion.dispose();
    },
  };
}

export function renderFisheyeLens(elements, frame, options = {}) {
  const canvas = elements.fisheye;
  if (!canvas) return;
  const text = frame.visible ? String(frame.currentText ?? '') : '';
  const timing = frame.fisheyeTiming;
  const available = Boolean(text) || frame.fisheyeStage === true;
  if (!available) {
    clearFisheyeLens(elements);
    return;
  }
  let view = views.get(elements.root);
  if (!view) {
    view = createView(canvas, options.gsap ?? globalThis.gsap);
    views.set(elements.root, view);
  }
  const variant = frame.fisheyeVariant === 'chorus' ? 'chorus' : 'base';
  const appearance = options.fisheyeAppearance;
  const lensLayout = resolveFisheyeLayout(appearance?.fisheyeLayout, variant);
  const motionAppearance = {
    ...appearance,
    fisheyeExit: resolveFisheyeExit(appearance?.fisheyeExit, variant),
  };
  canvas.hidden = false;
  canvas.dataset.fisheyeVariant = variant;
  canvas.dataset.fisheyeLayout = lensLayout;
  if (text) canvas.setAttribute('aria-label', text);
  else canvas.removeAttribute('aria-label');
  view.update(
    text,
    timing ?? { ageMs: 0, durationMs: Infinity },
    timing?.playing === true &&
      frame.timelineDiscontinuity !== true &&
      options.reducedMotion !== true,
    motionAppearance,
    frame.fisheyeReflectionClock,
    options.reducedMotion === true,
    {
      lensLayout,
      mode: appearance?.fisheyeLayout ?? 'auto',
      changedAt: frame.fisheyeLayoutChangedAt,
      canMove:
        frame.fisheyeReflectionClock?.playing === true &&
        frame.timelineDiscontinuity !== true &&
        options.reducedMotion !== true,
      settle:
        frame.timelineDiscontinuity === true || options.reducedMotion === true,
    },
  );
}
