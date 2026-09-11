export const ORNATE_VERTICAL_EXIT_DURATION_SECONDS = 0.12;
export const ORNATE_VERTICAL_ENTER_DURATION_SECONDS = 0.3;

export function ornateVerticalRevealDelaySeconds(index) {
  const normalized = Number.isFinite(Number(index))
    ? Math.max(0, Math.trunc(Number(index)))
    : 0;
  return Number(Math.min(normalized * 0.045, 0.27).toFixed(3));
}

export function ornateVerticalEnterPose(kind) {
  if (kind === 'han') {
    return {
      clipPath: 'inset(0 0 100% 0)',
    };
  }
  return {
    clipPath: 'inset(0 0 0% 0)',
  };
}
