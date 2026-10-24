import { onScopeDispose, shallowRef, watch } from 'vue';
import { readElementBoxesMessage } from '../../../shared/outputElementMessage.mjs';

// Accepts element boxes only from this preview's own iframes and origin (ADR 0027 P4).
export function useOutputElementBoxes({
  frameWindows,
  expectedOrigin,
  templateId,
  allowedIds,
}) {
  const boxesBySize = shallowRef({});

  function handleMessage(event) {
    const origin = expectedOrigin();
    if (!origin || event.origin !== origin) return;
    const sizeId = [...frameWindows()].find(
      ([, frameWindow]) => frameWindow && frameWindow === event.source,
    )?.[0];
    if (!sizeId) return;
    const boxes = readElementBoxesMessage(event.data, {
      templateId: templateId(),
      allowedIds: allowedIds(),
    });
    if (boxes) boxesBySize.value = { ...boxesBySize.value, [sizeId]: boxes };
  }

  watch([expectedOrigin, templateId], () => {
    boxesBySize.value = {};
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
    onScopeDispose(() => window.removeEventListener('message', handleMessage));
  }

  return { boxesBySize, handleMessage };
}
