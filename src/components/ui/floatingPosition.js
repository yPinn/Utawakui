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

export function anchoredFloatingPosition({
  anchor,
  surface,
  viewport,
  placement,
  direction = 'ltr',
  gap,
  inset,
}) {
  const side = placement.split('-')[0];
  const alignment = placement.split('-')[1];
  let left = anchor.left + (anchor.width - surface.width) / 2;
  let top = anchor.top - surface.height - gap;

  if (side === 'top' || side === 'bottom') {
    const above = anchor.top - surface.height - gap;
    const below = anchor.bottom + gap;
    if (
      side === 'top' &&
      above < inset &&
      below + surface.height <= viewport.height - inset
    ) {
      top = below;
    } else if (
      side === 'bottom' &&
      below + surface.height > viewport.height - inset &&
      above >= inset
    ) {
      top = above;
    } else {
      top = side === 'top' ? above : below;
    }
  }

  if (side === 'start' || side === 'end') {
    const logicalStartIsLeft = direction !== 'rtl';
    const preferLeft =
      side === 'start' ? logicalStartIsLeft : !logicalStartIsLeft;
    const leftSide = anchor.left - surface.width - gap;
    const rightSide = anchor.right + gap;
    if (
      preferLeft &&
      leftSide < inset &&
      rightSide + surface.width <= viewport.width - inset
    ) {
      left = rightSide;
    } else if (
      !preferLeft &&
      rightSide + surface.width > viewport.width - inset &&
      leftSide >= inset
    ) {
      left = leftSide;
    } else {
      left = preferLeft ? leftSide : rightSide;
    }
    top = anchor.top + (anchor.height - surface.height) / 2;
  }

  if (alignment) {
    const alignRight =
      direction === 'rtl' ? alignment === 'start' : alignment === 'end';
    left = alignRight ? anchor.right - surface.width : anchor.left;
  }

  return {
    left: clamp(left, inset, viewport.width - surface.width - inset),
    top: clamp(top, inset, viewport.height - surface.height - inset),
  };
}
