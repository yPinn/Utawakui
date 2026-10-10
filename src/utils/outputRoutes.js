import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';
import { captureSizeById } from '../constants/outputCaptureSizes.js';

const OUTPUT_PATH_BY_KIND = Object.freeze(
  Object.fromEntries(
    OUTPUT_TEMPLATE_VALUES.slots.map((slot) => [slot.id, slot.path]),
  ),
);

const OUTPUT_LABEL_BY_KIND = Object.freeze(
  Object.fromEntries(
    OUTPUT_TEMPLATE_VALUES.slots.map((slot) => [slot.id, slot.label]),
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
  return { obsUrl, previewUrl: obsUrl };
}

export function buildAllOutputSlotUrls(status) {
  return Object.fromEntries(
    OUTPUT_TEMPLATE_VALUES.slots.map((slot) => [
      slot.id,
      buildOutputSlotUrls(status, slot.id),
    ]),
  );
}

// OBS reads layer-* params on URL drop and strips them before saving the source.
export function buildOutputDropUrl(obsUrl, kind, captureSizeId) {
  const label = OUTPUT_LABEL_BY_KIND[kind];
  const size = captureSizeById(kind, captureSizeId);
  if (!obsUrl || !label || !size) return null;
  const url = new URL(obsUrl);
  url.searchParams.set('layer-name', `Utawakui ${label}`);
  url.searchParams.set('layer-width', String(size.width));
  url.searchParams.set('layer-height', String(size.height));
  // Qt's QUrlQuery does not decode '+' as a space.
  url.search = url.search.replaceAll('+', '%20');
  return url.toString();
}
