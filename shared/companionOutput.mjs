import templates from './outputTemplateValues.json' with { type: 'json' };
import {
  isOutputAppearanceFieldVisible,
  isOutputLocalFont,
  isPhantomPortraitId,
  MAX_PHANTOM_PORTRAIT_SETS,
  outputAppearanceFieldsForTemplate,
  outputElementFieldsForTemplate,
  sanitizeOutputAppearanceSetting,
  sanitizePhantomPortraitSets,
} from './outputAppearance.mjs';
import { lyricsPresentationFieldsForTemplate } from './presentation/lyricsPresentationPolicies.mjs';

const PORTRAIT = 'phantom-thieves';
export const COMPANION_OUTPUT_PORTRAIT = 'phantomPortraitActiveId';
export const COMPANION_OUTPUT_RESET = 'reset-template';

const fieldsByTemplate = new Map(
  Object.keys(templates.templateKinds).map((templateId) => [
    templateId,
    [
      ...outputAppearanceFieldsForTemplate(templateId),
      ...lyricsPresentationFieldsForTemplate(templateId),
      ...outputElementFieldsForTemplate(templateId),
    ].filter(
      ({ group, control }) =>
        group !== 'portrait' && ['select', 'range', 'color'].includes(control),
    ),
  ]),
);

export function companionOutputFields(templateId, options) {
  return (fieldsByTemplate.get(templateId) ?? []).filter((field) =>
    isOutputAppearanceFieldVisible(field, options),
  );
}

function optionValue(field, value, templateId) {
  if (!field) return undefined;
  if (field.options) {
    return field.options.some(({ id }) => id === value) ? value : undefined;
  }
  if (
    field.control === 'range' &&
    (typeof value !== 'number' || !(value >= field.min && value <= field.max))
  )
    return undefined;
  return sanitizeOutputAppearanceSetting(field.key, value, { templateId });
}

export function parseCompanionOutputChange(change) {
  if (
    !change ||
    typeof change !== 'object' ||
    Array.isArray(change) ||
    Object.keys(change).length !== 3 ||
    !['fieldKey', 'templateId', 'value'].every((key) =>
      Object.hasOwn(change, key),
    )
  )
    return null;
  const { templateId, fieldKey, value } = change;
  const fields = fieldsByTemplate.get(templateId);
  if (!fields) return null;
  if (fieldKey === COMPANION_OUTPUT_RESET && value === null)
    return { templateId, fieldKey, value };
  if (
    templateId === PORTRAIT &&
    fieldKey === COMPANION_OUTPUT_PORTRAIT &&
    (value === '' || isPhantomPortraitId(value))
  )
    return { templateId, fieldKey, value };
  const normalized = optionValue(
    fields.find(({ key }) => key === fieldKey),
    value,
    templateId,
  );
  return normalized === undefined
    ? null
    : { templateId, fieldKey, value: normalized };
}

function projectPortraits(settings) {
  const { activeId, items } = sanitizePhantomPortraitSets(
    settings.phantomPortraitSets,
  );
  return {
    activeId,
    items,
  };
}

export function projectCompanionOutputSlot(slot) {
  const { templateId, settings = {} } = slot ?? {};
  const fields = fieldsByTemplate.get(templateId);
  if (!fields) return null;
  const options = Object.fromEntries(
    fields.map((field) => [
      field.key,
      field.key === 'fontFamily' && isOutputLocalFont(settings.fontFamily)
        ? null
        : (optionValue(field, settings[field.key], templateId) ??
          field.defaultValue),
    ]),
  );
  return {
    templateId,
    options,
    ...(templateId === PORTRAIT && { portraits: projectPortraits(settings) }),
  };
}

export function companionOutputSettingsPatch(
  current,
  { templateId, fieldKey, value },
  settings,
) {
  if (fieldKey === COMPANION_OUTPUT_RESET) {
    return companionOutputResetPatch(current);
  }
  if (fieldKey === COMPANION_OUTPUT_PORTRAIT) {
    if (current.options.phantomMode !== 'side-card') return null;
    const sets = sanitizePhantomPortraitSets(settings.phantomPortraitSets);
    if (value !== '' && !sets.items.some(({ id }) => id === value)) return null;
    return sets.activeId === value
      ? {}
      : { phantomPortraitSets: { ...sets, activeId: value } };
  }
  const field = companionOutputFields(templateId, current.options).find(
    ({ key }) => key === fieldKey,
  );
  const normalized = optionValue(field, value, templateId);
  if (
    normalized === undefined ||
    (fieldKey === 'lookAmount' && current.options.paletteId === 'original')
  )
    return null;
  return normalized === current.options[fieldKey]
    ? {}
    : { [fieldKey]: normalized };
}

export function companionOutputResetPatch({ templateId, options }) {
  return Object.fromEntries(
    fieldsByTemplate
      .get(templateId)
      .filter((field) => field.defaultValue !== options[field.key])
      .map(({ key, defaultValue }) => [key, defaultValue]),
  );
}

function parsePortraits(portraits) {
  if (
    !Array.isArray(portraits?.items) ||
    portraits.items.length > MAX_PHANTOM_PORTRAIT_SETS + 1
  )
    throw new TypeError('Invalid companion Output portraits');
  const normalized = projectPortraits({ phantomPortraitSets: portraits });
  if (
    normalized.activeId !== portraits.activeId ||
    normalized.items.length !== portraits.items.length
  )
    throw new TypeError('Invalid companion Output portraits');
  return normalized;
}

export function parseCompanionOutputSnapshot(slots) {
  if (!Array.isArray(slots) || slots.length !== templates.slots.length)
    throw new TypeError('Invalid companion Output slots');
  return slots.map((slot, index) => {
    const { templateId, options, portraits } = slot ?? {};
    const fields = fieldsByTemplate.get(templateId);
    if (
      !fields ||
      templates.templateKinds[templateId] !== templates.slots[index].id ||
      !options ||
      typeof options !== 'object' ||
      Array.isArray(options)
    )
      throw new TypeError('Invalid companion Output slot');
    if (
      Object.keys(options).length !== fields.length ||
      !fields.every((field) => {
        if (!Object.hasOwn(options, field.key)) return false;
        const value = options[field.key];
        return (
          (field.key === 'fontFamily' && value === null) ||
          (value !== undefined &&
            optionValue(field, value, templateId) === value)
        );
      })
    )
      throw new TypeError('Invalid companion Output options');
    return {
      templateId,
      options: { ...options },
      ...(templateId === PORTRAIT && { portraits: parsePortraits(portraits) }),
    };
  });
}
