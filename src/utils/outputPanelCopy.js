import { catalogKey, i18n, t } from './i18n.js';

// Shared output definitions carry ids only; their labels live in the outputPanel catalog.
export const outputSlotLabel = (slotId) =>
  t(`outputPanel.slots.${catalogKey(slotId)}`);

export const lyricsPolicyLabel = (policyId) =>
  t(`outputPanel.policies.${catalogKey(policyId)}`);

export function localizeAppearanceField(field) {
  if (field.settingKind === 'lyrics-presentation') {
    return {
      ...field,
      label: t('outputPanel.presentationPolicy'),
      groupLabel: t('outputPanel.presentationGroup'),
      options: field.options.map((option) => ({
        ...option,
        label: lyricsPolicyLabel(option.id),
      })),
    };
  }
  const base = field.propertyKey
    ? `outputPanel.appearance.elementFields.${field.propertyKey}`
    : `outputPanel.appearance.fields.${field.copyKey ?? field.key}`;
  const unitKey = `${base}.unit`;
  const placeholderKey = `${base}.placeholder`;
  let groupKey = `outputPanel.appearance.groups.${catalogKey(field.group)}`;
  if (field.group === 'motion') {
    if (field.key.startsWith('fisheye'))
      groupKey = 'outputPanel.inspector.motion';
    if (field.key.startsWith('ornate'))
      groupKey = 'outputPanel.appearance.groups.ornateMotion';
  }
  return {
    ...field,
    label: t(`${base}.label`),
    groupLabel: t(groupKey),
    ...(i18n.global.te(unitKey) ? { unit: t(unitKey) } : {}),
    ...(field.control === 'text' && i18n.global.te(placeholderKey)
      ? { placeholder: t(placeholderKey) }
      : {}),
    ...(field.options
      ? {
          options: field.options.map((option) => {
            const key = catalogKey(option.id);
            const hintKey = `${base}.optionHints.${key}`;
            return {
              ...option,
              label: t(`${base}.options.${key}`),
              ...(i18n.global.te(hintKey) ? { hint: t(hintKey) } : {}),
            };
          }),
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
