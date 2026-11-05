export const ORNATE_VERTICAL_ENTER_DURATION_SECONDS = 0.3;

export function ornateVerticalRevealDelaySeconds(index) {
  const normalized = Number.isFinite(Number(index))
    ? Math.max(0, Math.trunc(Number(index)))
    : 0;
  return Number(Math.min(normalized * 0.045, 0.27).toFixed(3));
}

export function ornateVerticalScriptMotionEnabled(
  selectedTrackId,
  trackId,
  language,
) {
  return Boolean(
    selectedTrackId &&
    selectedTrackId === trackId &&
    /^ja(?:-|$)/iu.test(language ?? ''),
  );
}

export function ornateVerticalEnterPose(
  kind,
  { scriptMotion, columnIndex } = {},
) {
  if (scriptMotion && kind === 'han') {
    return { xPercent: columnIndex % 2 === 1 ? -18 : 18 };
  }
  if (kind === 'han' || (scriptMotion && kind === 'kana')) {
    return {
      clipPath: 'inset(0 0 100% 0)',
    };
  }
  return {
    clipPath: 'inset(0 0 0% 0)',
  };
}
