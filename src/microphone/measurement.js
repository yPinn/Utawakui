export const MICROPHONE_MEASUREMENT_STEPS = Object.freeze([
  { id: 'quiet', label: '安靜', instruction: '保持安靜，先不要播放伴奏。' },
  {
    id: 'voice',
    label: '發聲',
    instruction: '維持平常距離，連續以最輕的常用音量說話或輕唱；不要播放伴奏。',
  },
  {
    id: 'accompaniment',
    label: '伴奏',
    instruction: '播放平常使用的伴奏，自己保持安靜；不要改 B1 路由或音量。',
  },
  {
    id: 'mixed',
    label: '混合',
    instruction: '維持相同伴奏音量，開始說話或輕唱。',
  },
]);
const busy = (phase) => ['countdown', 'measuring'].includes(phase);
const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * fraction) - 1)
  ];

// One operator-owned window; numeric meter snapshots only, never microphone PCM.
export function createMicrophoneMeasurement({ publish = () => {} } = {}) {
  let state = {
    phase: 'idle',
    stepId: 'quiet',
    remainingMs: 0,
    history: [],
    results: {},
    notice: '',
  };
  let signature = null;
  let startAt = 0;
  let samples = [];
  let lastAt = null;
  let conditions = null;
  let lastSettings = null;
  const update = (values) => {
    state = { ...state, ...values };
    publish(state);
  };
  const ready = (input) =>
    input?.status === 'running' && Boolean(input.selectedDeviceId);
  function syncConditions(input) {
    if (input.settings) lastSettings = input.settings;
    const next = JSON.stringify([
      input.selectedDeviceId,
      input.controls,
      input.inputOptions,
      input.activityOptions,
      lastSettings,
    ]);
    if (signature !== null && signature !== next) {
      samples = [];
      lastAt = null;
      update({
        results: {},
        history: [],
        phase: 'idle',
        remainingMs: 0,
        notice: '輸入或設定已變更，請重測。',
      });
    }
    signature = next;
  }
  function cancel(message = '已取消，保留先前結果。') {
    samples = [];
    lastAt = null;
    update({ phase: 'idle', remainingMs: 0, notice: message });
  }
  function begin(stepId, input, now) {
    if (
      busy(state.phase) ||
      !ready(input) ||
      !Number.isFinite(now) ||
      !MICROPHONE_MEASUREMENT_STEPS.some((s) => s.id === stepId)
    )
      return false;
    syncConditions(input);
    samples = [];
    lastAt = null;
    startAt = now + 3000;
    conditions = {
      selectedDeviceId: input.selectedDeviceId,
      controls: { ...input.controls },
      inputOptions: { ...input.inputOptions },
      activityOptions: input.activityOptions
        ? { ...input.activityOptions }
        : undefined,
      settings: { ...input.settings },
    };
    update({ phase: 'countdown', stepId, remainingMs: 3000, notice: '' });
    return true;
  }
  function observe(input, now) {
    if (input?.controls) syncConditions(input);
    if (!ready(input)) {
      if (busy(state.phase)) cancel('輸入已停止，本步取消；請重測。');
      if (state.history.length) update({ history: [] });
      return;
    }
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(input.dbfs) ||
      !Number.isFinite(input.intensity)
    ) {
      if (busy(state.phase)) cancel('電平資料無效，請重測。');
      return;
    }
    const snapshot = {
      atMs: now,
      dbfs: Math.max(-100, Math.min(0, input.dbfs)),
      intensity: Math.max(0, Math.min(1, input.intensity)),
      clipped: input.clipped === true || input.rawClipped === true,
    };
    const history = [
      ...state.history.filter((s) => s.atMs > now - 10000 && s.atMs < now),
      snapshot,
    ].slice(-120);
    update({ history });
    if (!busy(state.phase)) return;
    if (now < startAt) {
      update({ remainingMs: startAt - now });
      return;
    }
    if (
      (lastAt === null && now - startAt > 500) ||
      (lastAt !== null && (now <= lastAt || now - lastAt > 500))
    ) {
      cancel('取樣中斷，請保持視窗可見後重測。');
      return;
    }
    if (now >= startAt + 10000) {
      if (samples.length < 80) {
        cancel('取樣不足，請重測。');
        return;
      }
      const values = samples.map((s) => s.dbfs);
      const result = {
        count: samples.length,
        p10Dbfs: percentile(values, 0.1),
        medianDbfs: percentile(values, 0.5),
        p95Dbfs: percentile(values, 0.95),
        maxDbfs: Math.max(...values),
        aboveFloorCount: samples.filter(
          (s) => s.dbfs > conditions.controls.noiseFloor,
        ).length,
        activeCount: samples.filter((s) => s.intensity > 0).length,
        nearClipCount: samples.filter((s) => s.clipped).length,
        conditions,
      };
      samples = [];
      lastAt = null;
      update({
        phase: 'complete',
        remainingMs: 0,
        results: { ...state.results, [state.stepId]: result },
        notice: '',
      });
      return;
    }
    samples.push(snapshot);
    lastAt = now;
    update({ phase: 'measuring', remainingMs: startAt + 10000 - now });
  }
  function clear() {
    cancel('量測結果已清除。');
    update({ results: {} });
  }
  publish(state);
  return { begin, observe, cancel, clear };
}
