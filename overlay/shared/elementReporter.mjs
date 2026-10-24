import { createElementBoxesMessage } from '../../shared/outputElementMessage.mjs';
import { OUTPUT_TEMPLATE_ELEMENTS } from '../../shared/outputTemplateElements.mjs';

// Union of every visible node tagged with an element id, in capture pixels.
export function collectElementBoxes(document, elementIds) {
  const boxes = [];
  for (const id of elementIds) {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const node of document.querySelectorAll(
      `[data-ovl-element="${id}"]`,
    )) {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    if (left < right && top < bottom) {
      boxes.push({
        id,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      });
    }
  }
  return boxes;
}

// Sends element boxes to the embedding Workbench; it never listens for messages.
export function startElementReporter({ window, document, getTemplateId }) {
  let frame = 0;
  let lastPayload = '';
  let disposed = false;

  function send() {
    frame = 0;
    const templateId = getTemplateId();
    const elementIds = (OUTPUT_TEMPLATE_ELEMENTS[templateId] ?? []).map(
      ({ id }) => id,
    );
    const message = createElementBoxesMessage(
      templateId,
      collectElementBoxes(document, elementIds),
      { width: window.innerWidth, height: window.innerHeight },
    );
    const payload = JSON.stringify(message);
    if (payload === lastPayload) return;
    lastPayload = payload;
    // The packaged control panel has an opaque file:// origin; CSP frame-ancestors bounds the embedder.
    window.parent.postMessage(message, '*');
  }

  function schedule() {
    if (!disposed && !frame) frame = window.requestAnimationFrame(send);
  }

  const mutations = new window.MutationObserver(schedule);
  mutations.observe(document.documentElement, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  const resizes =
    typeof window.ResizeObserver === 'function'
      ? new window.ResizeObserver(schedule)
      : null;
  resizes?.observe(document.documentElement);
  window.addEventListener('resize', schedule);
  Promise.resolve(document.fonts?.ready).then(schedule, () => {});
  schedule();

  return {
    schedule,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      mutations.disconnect();
      resizes?.disconnect();
      window.removeEventListener('resize', schedule);
    },
  };
}
