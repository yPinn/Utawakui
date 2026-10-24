// Workbench-only element box message from an Output preview to the control panel (ADR 0027 P4).
export const OUTPUT_ELEMENT_BOXES_MESSAGE = 'utawakui:output-element-boxes';

const MAX_ELEMENTS = 16;
const MAX_CANVAS_SIZE = 4096;
const ELEMENT_ID_RE = /^[a-z][a-z0-9-]{0,31}$/u;

function roundBox(value) {
  return Math.round(value * 10) / 10;
}

export function createElementBoxesMessage(templateId, elements, viewport) {
  return {
    type: OUTPUT_ELEMENT_BOXES_MESSAGE,
    templateId,
    viewport: { width: viewport.width, height: viewport.height },
    elements: elements.map(({ id, x, y, width, height }) => ({
      id,
      x: roundBox(x),
      y: roundBox(y),
      width: roundBox(width),
      height: roundBox(height),
    })),
  };
}

function isBoundedNumber(value, min, max) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

// Returns validated boxes, or null when the payload is not for this template.
export function readElementBoxesMessage(data, { templateId, allowedIds }) {
  if (
    typeof data !== 'object' ||
    data === null ||
    data.type !== OUTPUT_ELEMENT_BOXES_MESSAGE ||
    data.templateId !== templateId ||
    !Array.isArray(data.elements) ||
    data.elements.length > MAX_ELEMENTS
  ) {
    return null;
  }
  const { width, height } = data.viewport ?? {};
  if (
    !isBoundedNumber(width, 1, MAX_CANVAS_SIZE) ||
    !isBoundedNumber(height, 1, MAX_CANVAS_SIZE)
  ) {
    return null;
  }
  const allowed = new Set(allowedIds);
  const elements = [];
  for (const box of data.elements) {
    if (
      typeof box !== 'object' ||
      box === null ||
      typeof box.id !== 'string' ||
      !ELEMENT_ID_RE.test(box.id) ||
      !allowed.has(box.id) ||
      !isBoundedNumber(box.x, -width, width * 2) ||
      !isBoundedNumber(box.y, -height, height * 2) ||
      !isBoundedNumber(box.width, 0, width * 2) ||
      !isBoundedNumber(box.height, 0, height * 2)
    ) {
      return null;
    }
    elements.push({
      id: box.id,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    });
  }
  return { viewport: { width, height }, elements };
}

// Smallest box under the point wins; outside every box selects the template.
export function hitTestElementBoxes(elements, point) {
  let match = null;
  for (const box of elements) {
    const inside =
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height;
    if (inside && (!match || box.width * box.height < match.area)) {
      match = { id: box.id, area: box.width * box.height };
    }
  }
  return match?.id ?? 'template';
}
