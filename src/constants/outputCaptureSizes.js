import OUTPUT_CAPTURE_VALUES from '../../shared/outputCaptureValues.json';
import OUTPUT_TEMPLATE_VALUES from '../../shared/outputTemplateValues.json';

function freezeCaptureSize(size) {
  return Object.freeze({ ...size });
}

export const OUTPUT_REFERENCE_CANVAS = Object.freeze({
  ...OUTPUT_CAPTURE_VALUES.referenceCanvas,
});

export const OUTPUT_WIDGET_CAPTURE_SIZES = Object.freeze(
  OUTPUT_CAPTURE_VALUES.widgetSizes.map(freezeCaptureSize),
);

export const OUTPUT_LYRICS_CAPTURE_SIZE = freezeCaptureSize(
  OUTPUT_CAPTURE_VALUES.lyricsSize,
);

const WIDGET_SIZE_BY_ID = new Map(
  OUTPUT_WIDGET_CAPTURE_SIZES.map((size) => [size.id, size]),
);
const LARGE_WIDGET_CAPTURE_SIZE = WIDGET_SIZE_BY_ID.get('large');

export function calculateWidgetPreviewScale({
  availableWidth,
  availableHeight,
  optionCount,
  columnGap = 0,
  captionHeight = 0,
  rowGap = 0,
}) {
  const count = Math.max(1, Number.isFinite(optionCount) ? optionCount : 1);
  const width = Math.max(0, Number(availableWidth) || 0);
  const height = Math.max(0, Number(availableHeight) || 0);
  const horizontalGaps = Math.max(0, Number(columnGap) || 0) * (count - 1);
  const canvasHeight = Math.max(
    0,
    height -
      Math.max(0, Number(captionHeight) || 0) -
      Math.max(0, Number(rowGap) || 0),
  );
  const columnWidth = Math.max(0, width - horizontalGaps) / count;
  return Math.max(
    0,
    Math.min(
      1,
      columnWidth / LARGE_WIDGET_CAPTURE_SIZE.width,
      canvasHeight / LARGE_WIDGET_CAPTURE_SIZE.height,
    ),
  );
}
export function defaultCaptureSizeIdForKind(kind) {
  return (
    OUTPUT_CAPTURE_VALUES.slotDefaults[kind] ??
    OUTPUT_WIDGET_CAPTURE_SIZES[0].id
  );
}

export function supportedCaptureSizeIdsForTemplate(templateId, kind) {
  if (kind === 'lyrics') return [OUTPUT_LYRICS_CAPTURE_SIZE.id];
  const configured = OUTPUT_TEMPLATE_VALUES.templateCaptureSizes?.[templateId];
  const supported = configured?.supported?.filter((id) =>
    WIDGET_SIZE_BY_ID.has(id),
  );
  return supported?.length
    ? [...supported]
    : [defaultCaptureSizeIdForKind(kind)];
}

export function normalizeCaptureSizeId(kind, value, templateId = null) {
  if (kind === 'lyrics') return OUTPUT_LYRICS_CAPTURE_SIZE.id;
  const supported = supportedCaptureSizeIdsForTemplate(templateId, kind);
  if (supported.includes(value)) return value;
  const configuredDefault =
    OUTPUT_TEMPLATE_VALUES.templateCaptureSizes?.[templateId]?.default;
  return supported.includes(configuredDefault)
    ? configuredDefault
    : supported[0];
}

export function captureSizeForKind(kind, value, templateId = null) {
  if (kind === 'lyrics') return OUTPUT_LYRICS_CAPTURE_SIZE;
  return (
    WIDGET_SIZE_BY_ID.get(normalizeCaptureSizeId(kind, value, templateId)) ??
    OUTPUT_WIDGET_CAPTURE_SIZES[0]
  );
}
