import { computed, onScopeDispose } from 'vue';
import { usePlayer } from '../usePlayer.js';
import { useTrackGain } from '../useTrackGain.js';
import { t } from '../../utils/i18n.js';

const SAVE_DELAY_MS = 400;

function formatDb(value) {
  const number = Number(value) || 0;
  const sign = number > 0 ? '+' : number < 0 ? '−' : '';
  const text = sign + Math.abs(number).toFixed(1);
  return t('player.bar.trackGainValue', { value: text });
}

// "This track's volume" adjust row: previews at once, saves after the drag.
export function usePlayerTrackGainRow() {
  const { state, setTrackGainDb } = usePlayer();
  const { range, gainDbFor, saveTrackGain } = useTrackGain();
  let pending = null;

  function cancelPending() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  }

  async function persist(trackId, gainDb) {
    const result = await saveTrackGain(trackId, gainDb);
    if (!result?.ok && state.track?.id === trackId)
      setTrackGainDb(await gainDbFor(trackId));
  }

  function setGain(value) {
    const trackId = state.track?.id;
    if (!trackId) return;
    setTrackGainDb(Number(value));
    const gainDb = state.trackGainDb;
    cancelPending();
    pending = {
      timer: setTimeout(() => {
        pending = null;
        void persist(trackId, gainDb);
      }, SAVE_DELAY_MS),
    };
  }

  function step(direction) {
    setGain((Number(state.trackGainDb) || 0) + direction * range.step);
  }

  onScopeDispose(cancelPending);

  return computed(() => {
    const value = Number(state.trackGainDb) || 0;
    return {
      key: 'track-gain',
      label: t('player.bar.trackGain'),
      value: formatDb(value),
      minusDisabled: !state.track || value <= range.min,
      minusLabel: t('player.bar.trackGainDown'),
      minusTitle: t('player.bar.trackGainDown'),
      onMinus: () => step(-1),
      sliderValue: value,
      defaultValue: range.defaultValue,
      min: range.min,
      max: range.max,
      step: range.step,
      sliderLabel: t('player.bar.trackGainSlider'),
      formatSliderValue: formatDb,
      onSliderInput: setGain,
      plusDisabled: !state.track || value >= range.max,
      plusLabel: t('player.bar.trackGainUp'),
      plusTitle: t('player.bar.trackGainUp'),
      onPlus: () => step(1),
    };
  });
}
