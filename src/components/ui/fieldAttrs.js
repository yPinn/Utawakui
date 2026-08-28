export function nativeControlAttrs(attrs) {
  return Object.fromEntries(
    Object.entries(attrs).filter(
      ([name]) => name !== 'class' && name !== 'style',
    ),
  );
}
