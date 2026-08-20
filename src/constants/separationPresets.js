export const SEPARATION_PRESET_OPTIONS = Object.freeze([
  {
    id: 'standard',
    label: '和聲保留（快速）',
  },
  {
    id: 'high-quality',
    label: '和聲保留+（較慢）',
  },
  {
    id: 'inst-hq3',
    label: '純伴奏（較慢）',
  },
]);

export const DEFAULT_SEPARATION_PRESET_ID = 'standard';

export const SEPARATION_PRESET_SELECT_TITLE =
  '和聲保留會盡量保留和聲與伴唱感；和聲保留+是同方向的精細處理；純伴奏會更積極移除人聲。括號內表示處理速度，已產生的項目會直接切換播放。';

export function hasSeparationPreset(presetId) {
  return SEPARATION_PRESET_OPTIONS.some((preset) => preset.id === presetId);
}
