function cloneScalarSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(settings).filter(([, value]) => {
      return (
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        value === null ||
        (typeof value === 'number' && Number.isFinite(value))
      );
    }),
  );
}

export function buildOutputSlotPayload(slot, changes = {}) {
  const templateId = changes.templateId ?? slot?.templateId;
  if (typeof templateId !== 'string') return null;

  const styleSetIds = changes.styleSetIds ?? slot?.styleSetIds;
  return {
    templateId,
    styleSetIds: Array.isArray(styleSetIds)
      ? [...styleSetIds].filter((id) => typeof id === 'string')
      : [],
    settings: cloneScalarSettings({
      ...(slot?.settings ?? {}),
      ...(changes.settings ?? {}),
    }),
  };
}
