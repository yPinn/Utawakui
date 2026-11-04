import { catalogKey, i18n, t } from './i18n.js';

// Shared output definitions carry ids only; their labels live in the outputPanel catalog.
export const outputSlotLabel = (slotId) =>
  t(`outputPanel.slots.${catalogKey(slotId)}`);

export const lyricsPolicyLabel = (policyId) =>
  t(`outputPanel.policies.${catalogKey(policyId)}`);

export function localizeAppearanceField(field) {
  const base = field.propertyKey
    ? `outputPanel.appearance.elementFields.${field.propertyKey}`
    : `outputPanel.appearance.fields.${field.key}`;
  const unitKey = `${base}.unit`;
  return {
    ...field,
    label: t(`${base}.label`),
    groupLabel: t(`outputPanel.appearance.groups.${catalogKey(field.group)}`),
    ...(i18n.global.te(unitKey) ? { unit: t(unitKey) } : {}),
    ...(field.options
      ? {
          options: field.options.map((option) => ({
            ...option,
            label: t(`${base}.options.${catalogKey(option.id)}`),
          })),
        }
      : {}),
  };
}

export function localizeElementTarget(target) {
  return {
    ...target,
    label: t(`outputPanel.appearance.elements.${catalogKey(target.id)}`),
    fields: target.fields.map(localizeAppearanceField),
  };
}
