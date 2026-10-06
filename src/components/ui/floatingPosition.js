function rootFontPixels() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 16;
  }
  const value = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(value) ? value : 16;
}

export function customLengthPixels(name, fallbackRem, seen = new Set()) {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    seen.has(name)
  ) {
    return fallbackRem * rootFontPixels();
  }
  seen.add(name);
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const reference = value.match(/^var\((--ui-[\w-]+)\)$/u)?.[1];
  if (reference) return customLengthPixels(reference, fallbackRem, seen);

  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return fallbackRem * rootFontPixels();
  if (value.endsWith('rem')) return amount * rootFontPixels();
  if (value.endsWith('px')) return amount;
  return fallbackRem * rootFontPixels();
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(minimum, value), Math.max(minimum, maximum));
}

function inlineAlignmentLeft({ anchor, width, alignment, direction }) {
  if (!alignment) return anchor.left + (anchor.width - width) / 2;
  const alignRight =
    direction === 'rtl' ? alignment === 'start' : alignment === 'end';
  return alignRight ? anchor.right - width : anchor.left;
}

function blockAlignmentTop({ anchor, height, alignment }) {
  if (alignment === 'start') return anchor.top;
  if (alignment === 'end') return anchor.bottom - height;
  return anchor.top + (anchor.height - height) / 2;
}

function resolvedSide({
  preferred,
  alternate,
  preferredAvailable,
  alternateAvailable,
  required,
}) {
  if (required <= preferredAvailable) return preferred;
  if (required <= alternateAvailable) return alternate;
  return alternateAvailable > preferredAvailable ? alternate : preferred;
}

function physicalInlineSide(side, direction) {
  const logicalStartIsLeft = direction !== 'rtl';
  if (side === 'start') return logicalStartIsLeft ? 'left' : 'right';
  return logicalStartIsLeft ? 'right' : 'left';
}

// With flipAlignment, a start／end-aligned block placement keeps its preferred
// inline alignment while it fits, and mirrors only when the other one does.
function resolvedInlineAlignment({
  anchor,
  width,
  alignment,
  direction,
  viewport,
  inset,
  flipAlignment,
}) {
  if (!flipAlignment || (alignment !== 'start' && alignment !== 'end')) {
    return alignment;
  }
  const fits = (candidate) => {
    const left = inlineAlignmentLeft({
      anchor,
      width,
      alignment: candidate,
      direction,
    });
    return left >= inset && left + width <= viewport.width - inset;
  };
  if (fits(alignment)) return alignment;
  const alternate = alignment === 'start' ? 'end' : 'start';
  return fits(alternate) ? alternate : alignment;
}

export function anchoredFloatingLayout({
  anchor,
  surface,
  viewport,
  placement,
  direction = 'ltr',
  gap,
  inset,
  flipAlignment = false,
}) {
  const requestedSide = placement.split('-')[0];
  let alignment = placement.split('-')[1];
  const viewportWidth = Math.max(0, viewport.width - inset * 2);
  let width = Math.min(surface.width, viewportWidth);
  let left;
  let top;
  let side;

  if (requestedSide === 'top' || requestedSide === 'bottom') {
    const above = anchor.top - surface.height - gap;
    const below = anchor.bottom + gap;
    const aboveAvailable = Math.max(0, anchor.top - gap - inset);
    const belowAvailable = Math.max(
      0,
      viewport.height - inset - anchor.bottom - gap,
    );
    const alternate = requestedSide === 'top' ? 'bottom' : 'top';
    side = resolvedSide({
      preferred: requestedSide,
      alternate,
      preferredAvailable:
        requestedSide === 'top' ? aboveAvailable : belowAvailable,
      alternateAvailable:
        requestedSide === 'top' ? belowAvailable : aboveAvailable,
      required: surface.height,
    });
    top = side === 'top' ? above : below;
    alignment = resolvedInlineAlignment({
      anchor,
      width,
      alignment,
      direction,
      viewport,
      inset,
      flipAlignment,
    });
    left = inlineAlignmentLeft({ anchor, width, alignment, direction });
  } else {
    const preferred = physicalInlineSide(requestedSide, direction);
    const alternate = preferred === 'left' ? 'right' : 'left';
    const leftAvailable = Math.max(0, anchor.left - gap - inset);
    const rightAvailable = Math.max(
      0,
      viewport.width - inset - anchor.right - gap,
    );
    side = resolvedSide({
      preferred,
      alternate,
      preferredAvailable: preferred === 'left' ? leftAvailable : rightAvailable,
      alternateAvailable: preferred === 'left' ? rightAvailable : leftAvailable,
      required: width,
    });
    const available = side === 'left' ? leftAvailable : rightAvailable;
    width = Math.min(width, available);
    const leftSide = anchor.left - width - gap;
    const rightSide = anchor.right + gap;
    left = side === 'left' ? leftSide : rightSide;
    top = blockAlignmentTop({
      anchor,
      height: surface.height,
      alignment,
    });
  }

  return {
    left: clamp(left, inset, viewport.width - width - inset),
    top: clamp(top, inset, viewport.height - surface.height - inset),
    side,
    alignment,
    width,
  };
}

export function anchoredFloatingPosition(options) {
  const { left, top } = anchoredFloatingLayout(options);
  return { left, top };
}

// With flipInline, a pointer menu opens toward logical inline-end of the
// pointer and mirrors to the other side only when that side fits.
export function pointFloatingPosition({
  point,
  surface,
  viewport,
  direction = 'ltr',
  inset,
  flipInline = false,
}) {
  const towardRight = point.x;
  const towardLeft = point.x - surface.width;
  const fits = (left) =>
    left >= inset && left + surface.width <= viewport.width - inset;
  let logicalStart = direction === 'rtl' ? towardLeft : towardRight;
  if (flipInline && !fits(logicalStart)) {
    const mirrored = direction === 'rtl' ? towardRight : towardLeft;
    if (fits(mirrored)) logicalStart = mirrored;
  }
  return {
    left: clamp(logicalStart, inset, viewport.width - surface.width - inset),
    top: clamp(point.y, inset, viewport.height - surface.height - inset),
  };
}
