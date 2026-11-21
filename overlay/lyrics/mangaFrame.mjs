import {
  DEFAULT_MANGA_FRAME_ID,
  MANGA_FRAME_VIEW_BOX,
  mangaFrameLengthTier,
  mangaFrameShapes,
  mangaFrameSideForLine,
  resolveMangaFrame,
} from '../shared/mangaFrameContract.mjs';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const tailRenderKeys = new WeakMap();
export const MANGA_FADE_IN_DURATION_SECONDS = 0.16;
const MANGA_FADE_OUT_DURATION_SECONDS = 0.14;

export function addMangaBubbleFade(
  timeline,
  targets,
  direction,
  stagger = true,
  position,
) {
  timeline.addLabel(direction, position);
  if (direction === 'enter') {
    for (const [index, target] of targets.entries()) {
      timeline.to(
        target,
        {
          autoAlpha: 1,
          duration: MANGA_FADE_IN_DURATION_SECONDS,
          ease: 'power2.out',
          overwrite: 'auto',
        },
        index === 0 || !stagger ? direction : '+=1',
      );
    }
    return;
  }

  timeline.to(
    targets,
    {
      autoAlpha: 0,
      duration: MANGA_FADE_OUT_DURATION_SECONDS,
      ease: 'power2.in',
      overwrite: 'auto',
      ...(stagger && { stagger: { each: 0.06, from: 'start' } }),
    },
    direction,
  );
}

export function addMangaBubbleHandoff(
  timeline,
  outgoing,
  incoming,
  staggerEntrance = true,
  position = 0,
) {
  // A lane can be reused by a taller bubble or its tail, even across rows.
  const sharedLane = outgoing.some((previous) =>
    incoming.some(
      (next) => next.dataset.mangaSide === previous.dataset.mangaSide,
    ),
  );
  addMangaBubbleFade(timeline, outgoing, 'exit', !sharedLane, position);
  addMangaBubbleFade(
    timeline,
    incoming,
    'enter',
    staggerEntrance,
    position + (sharedLane ? MANGA_FADE_OUT_DURATION_SECONDS : 0),
  );
}

export function renderMangaFrameSvg(
  svg,
  frameId = DEFAULT_MANGA_FRAME_ID,
  target = null,
  cloudContains,
) {
  const frame = resolveMangaFrame(frameId);
  const documentApi = svg?.ownerDocument;
  if (!svg || typeof documentApi?.createElementNS !== 'function') return frame;

  const tailKey = target
    ? `${Math.round(target.x)},${Math.round(target.y)}`
    : '';
  if (svg.dataset.frameId === frame.id && tailRenderKeys.get(svg) === tailKey) {
    return frame;
  }

  const shapes = mangaFrameShapes(frame, target, cloudContains).map(
    (element) => {
      const shape = documentApi.createElementNS(SVG_NAMESPACE, element.tag);
      shape.setAttribute('class', 'lyrics-overlay__manga-frame-shape');
      for (const [name, value] of Object.entries(element.attrs)) {
        shape.setAttribute(name, value);
      }
      return shape;
    },
  );

  svg.replaceChildren(...shapes);
  svg.setAttribute('viewBox', MANGA_FRAME_VIEW_BOX);
  svg.dataset.frameId = frame.id;
  tailRenderKeys.set(svg, tailKey);
  svg.style.setProperty(
    '--ovl-manga-frame-line-join',
    frame.lineJoin ?? 'round',
  );
  svg.style.setProperty(
    '--ovl-manga-frame-stroke-width',
    String(frame.strokeWidth ?? 7),
  );
  return frame;
}

// getScreenCTM() returns a legacy SVGMatrix, which has no transformPoint().
function applyMatrix({ a, b, c, d, e, f }, { x, y }) {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

export function updateMangaFrameTails(group, target) {
  if (!group || group.hidden) return;
  // Read every bubble's geometry before rewriting any tail to avoid layout thrash.
  const updates = [];
  for (const bubble of group.children) {
    const svg = bubble.children[0];
    const frameId = svg?.dataset?.frameId;
    if (!['spoken', 'whisper', 'thought'].includes(frameId)) continue;
    if (!target && !tailRenderKeys.get(svg)) continue;

    const view = svg.ownerDocument?.defaultView;
    const matrix = target && svg.getScreenCTM?.();
    if (target && (!matrix || !view)) continue;
    const point = matrix
      ? applyMatrix(matrix.inverse(), {
          x: view.innerWidth * target.x,
          y: view.innerHeight * target.y,
        })
      : null;
    if (point && (!Number.isFinite(point.x) || !Number.isFinite(point.y)))
      continue;
    updates.push({ svg, frameId, point, view });
  }
  for (const { svg, frameId, point, view } of updates) {
    const body = svg.children[0];
    renderMangaFrameSvg(svg, frameId, point, (sample) =>
      body.isPointInFill(new view.DOMPoint(sample.x, sample.y)),
    );
  }
}

export function applyMangaFramePresentation(elements, frame, options = {}) {
  const definition = renderMangaFrameSvg(
    elements.mangaFrame,
    options.mangaFrameId,
  );
  elements.root.dataset.mangaFrame = definition.id;
  elements.root.dataset.mangaLength = mangaFrameLengthTier(frame.currentText);
  elements.root.dataset.mangaSide = mangaFrameSideForLine(frame.lineIndex);
  return definition;
}
