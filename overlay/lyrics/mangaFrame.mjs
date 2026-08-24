import {
  DEFAULT_MANGA_FRAME_ID,
  MANGA_FRAME_VIEW_BOX,
  mangaFrameLengthTier,
  mangaFrameSideForLine,
  resolveMangaFrame,
} from '../shared/mangaFrameContract.mjs';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export function renderMangaFrameSvg(svg, frameId = DEFAULT_MANGA_FRAME_ID) {
  const frame = resolveMangaFrame(frameId);
  const documentApi = svg?.ownerDocument;
  if (!svg || typeof documentApi?.createElementNS !== 'function') return frame;

  if (
    svg.dataset.frameId === frame.id &&
    svg.children.length === frame.elements.length
  ) {
    return frame;
  }

  const shapes = frame.elements.map((element) => {
    const shape = documentApi.createElementNS(SVG_NAMESPACE, element.tag);
    shape.setAttribute('class', 'lyrics-overlay__manga-frame-shape');
    for (const [name, value] of Object.entries(element.attrs)) {
      shape.setAttribute(name, value);
    }
    return shape;
  });

  svg.replaceChildren(...shapes);
  svg.setAttribute('viewBox', MANGA_FRAME_VIEW_BOX);
  svg.dataset.frameId = frame.id;
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
