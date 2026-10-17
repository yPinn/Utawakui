import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import {
  carryOutputAppearanceToTemplate,
  OUTPUT_SLOT_APPEARANCE_DEFAULTS,
  sanitizeOutputLocalFont,
} from '../../shared/outputAppearance.mjs';

function cloneScalarSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(settings).flatMap(([key, value]) => {
      if (
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        value === null ||
        (typeof value === 'number' && Number.isFinite(value))
      ) {
        return [[key, value]];
      }
      if (key === 'fontFamily') {
        const localFont = sanitizeOutputLocalFont(value);
        if (localFont) return [[key, localFont]];
      }
      return [];
    }),
  );
}

export function buildOutputSlotPayload(slot, changes = {}) {
  const templateId = changes.templateId ?? slot?.templateId;
  if (typeof templateId !== 'string') return null;

  const styleSetIds = changes.styleSetIds ?? slot?.styleSetIds;
  const kind = OUTPUT_TEMPLATE_VALUES.templateKinds[templateId];
  const carried = carryOutputAppearanceToTemplate(slot?.settings ?? {}, {
    fromTemplateId: slot?.templateId,
    toTemplateId: templateId,
    slotDefaults: OUTPUT_SLOT_APPEARANCE_DEFAULTS[kind],
  });
  return {
    templateId,
    styleSetIds: Array.isArray(styleSetIds)
      ? [...styleSetIds].filter((id) => typeof id === 'string')
      : [],
    settings: cloneScalarSettings({
      ...carried,
      ...(changes.settings ?? {}),
    }),
  };
}
