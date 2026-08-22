import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';

const OUTPUT_PATH_BY_KIND = Object.freeze(
  Object.fromEntries(
    OUTPUT_TEMPLATE_VALUES.slots.map((slot) => [slot.id, slot.path]),
  ),
);

export function outputPathForKind(kind) {
  return OUTPUT_PATH_BY_KIND[kind] ?? null;
}

export function buildOutputSlotUrls(status, kind) {
  const path = outputPathForKind(kind);
  const baseUrl =
    status?.httpUrl ??
    (status?.host && Number.isSafeInteger(status?.port)
      ? `http://${status.host}:${status.port}`
      : null);
  if (!baseUrl || !path) {
    return { obsUrl: null, previewUrl: null };
  }

  const obsUrl = new URL(path, baseUrl).toString();
  if (!status.running || !status.httpUrl) {
    return { obsUrl, previewUrl: null };
  }
  const previewUrl = new URL(obsUrl);
  previewUrl.searchParams.set('preview', '1');
  return { obsUrl, previewUrl: previewUrl.toString() };
}

export function buildAllOutputSlotUrls(status) {
  return Object.fromEntries(
    OUTPUT_TEMPLATE_VALUES.slots.map((slot) => [
      slot.id,
      buildOutputSlotUrls(status, slot.id),
    ]),
  );
}
