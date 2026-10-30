import {
  MICROPHONE_LEVEL_DEFAULTS,
  normalizeMicrophoneControls,
  measureMicrophoneLevel,
  projectMicrophoneLevel,
} from './level.js';

const SAMPLE_MS = 33;
const RESET = { dbfs: -100, peak: 0, intensity: 0, clipped: false };

// Owns one analysis-only stream. No player, destination, file or Output access.
export function createMicrophoneResearchRuntime({
  mediaDevices,
  access,
  createContext,
  publish = () => {},
  onError = () => {},
  now = () => performance.now(),
} = {}) {
  let state = {
    status: 'idle',
    error: '',
    devices: [],
    selectedDeviceId: '',
    refreshing: false,
    controls: { ...MICROPHONE_LEVEL_DEFAULTS },
    settings: null,
    ...RESET,
  };
  let current = null;
  let destroyed = false;
  let listRevision = 0;
  function update(values) {
    if (destroyed) return;
    state = { ...state, ...values };
    publish(state);
  }
  function report(error, code) {
    onError(error, code);
  }
  function release(lease) {
    if (!lease) return;
    Promise.resolve(access.endMicrophoneResearch(lease)).catch((error) =>
      report(error, 'MIC_RESEARCH_RELEASE_FAILED'),
    );
  }
  function stopTracks(stream) {
    for (const track of stream?.getTracks() ?? []) track.stop();
  }
  function clean(op) {
    clearTimeout(op.timer);
    clearTimeout(op.watchdog);
    for (const remove of op.listeners) remove();
    op.listeners = [];
    op.source?.disconnect();
    op.analyser?.disconnect();
    stopTracks(op.stream);
    op.stream = null;
    if (op.context) {
      void op.context
        .close()
        .catch((error) => report(error, 'MIC_RESEARCH_CLOSE_FAILED'));
      op.context = null;
    }
    release(op.lease);
    op.lease = null;
  }
  function stop(status = 'idle', error = '') {
    const previous = current;
    current = null;
    listRevision += 1;
    if (previous) clean(previous);
    update({ status, error, refreshing: false, settings: null, ...RESET });
  }
  const isCurrent = (op) => !destroyed && current === op;
  function fail(op, error, code, message) {
    if (!isCurrent(op)) return;
    stop('error', message);
    report(error, code);
  }
  function listen(op, target, event, handler) {
    target.addEventListener(event, handler);
    op.listeners.push(() => target.removeEventListener(event, handler));
  }
  function availableDevices(entries) {
    return entries
      .filter(
        (device) =>
          device.kind === 'audioinput' &&
          typeof device.deviceId === 'string' &&
          device.deviceId.length > 0 &&
          device.deviceId.length <= 512 &&
          !['default', 'communications'].includes(device.deviceId),
      )
      .slice(0, 64)
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label?.slice(0, 200) || `未命名輸入 ${index + 1}`,
      }));
  }
  async function refreshDevices() {
    if (destroyed || current || state.refreshing) return false;
    const revision = ++listRevision;
    let lease;
    update({ refreshing: true, error: '' });
    try {
      if (!mediaDevices?.enumerateDevices || !access?.beginMicrophoneResearch)
        throw new Error('Mic research unavailable');
      lease = await access.beginMicrophoneResearch();
      if (destroyed || revision !== listRevision) return false;
      if (!lease) throw new Error('Mic research permission unavailable');
      const devices = availableDevices(await mediaDevices.enumerateDevices());
      if (destroyed || revision !== listRevision) return false;
      const selectedDeviceId = devices.some(
        (d) => d.id === state.selectedDeviceId,
      )
        ? state.selectedDeviceId
        : '';
      update({ devices, selectedDeviceId, status: 'idle' });
      return true;
    } catch (error) {
      if (!destroyed && revision === listRevision) {
        update({
          status: 'error',
          error: '無法讀取輸入裝置，請確認系統權限後重試。',
        });
        report(error, 'MIC_RESEARCH_LIST_FAILED');
      }
      return false;
    } finally {
      release(lease);
      if (revision === listRevision) update({ refreshing: false });
    }
  }
  function selectDevice(id) {
    if (destroyed || !state.devices.some((d) => d.id === id)) return false;
    if (id !== state.selectedDeviceId) {
      stop();
      update({ selectedDeviceId: id });
    }
    return true;
  }
  async function start() {
    if (destroyed || current || state.refreshing || !state.selectedDeviceId)
      return false;
    stop();
    const op = {
      listeners: [],
      lease: null,
      stream: null,
      context: null,
      source: null,
      analyser: null,
      timer: null,
      watchdog: null,
    };
    const deviceId = state.selectedDeviceId;
    current = op;
    update({ status: 'requesting', error: '' });
    op.watchdog = setTimeout(
      () =>
        fail(
          op,
          new Error('Input request timed out'),
          'MIC_RESEARCH_START_TIMEOUT',
          '輸入啟動逾時，請停止其他裝置操作後重試。',
        ),
      15_000,
    );
    try {
      if (
        !mediaDevices?.getUserMedia ||
        !createContext ||
        !access?.beginMicrophoneResearch
      )
        throw new Error('Input unavailable');
      const lease = await access.beginMicrophoneResearch();
      if (!isCurrent(op)) {
        release(lease);
        return false;
      }
      op.lease = lease;
      if (!lease) throw new Error('Input permission unavailable');
      const stream = await mediaDevices.getUserMedia({
        video: false,
        audio: {
          deviceId: { exact: deviceId },
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (!isCurrent(op)) {
        stopTracks(stream);
        return false;
      }
      op.stream = stream;
      const tracks = stream.getAudioTracks();
      const settings = tracks[0]?.getSettings();
      if (
        tracks.length !== 1 ||
        stream.getTracks().length !== 1 ||
        settings?.deviceId !== deviceId ||
        tracks[0].readyState !== 'live' ||
        tracks[0].muted
      )
        throw new Error('Selected input unavailable');
      const lost = () => {
        if (isCurrent(op))
          stop('lost', '輸入訊號已中斷，請確認裝置後重新開始。');
      };
      listen(op, tracks[0], 'ended', lost);
      listen(op, tracks[0], 'mute', lost);
      op.context = createContext();
      listen(op, op.context, 'statechange', () => {
        if (
          isCurrent(op) &&
          state.status === 'running' &&
          op.context.state !== 'running'
        )
          lost();
      });
      await op.context.resume();
      if (!isCurrent(op)) return false;
      if (op.context.state !== 'running')
        throw new Error('Analysis context unavailable');
      op.source = op.context.createMediaStreamSource(stream);
      op.analyser = op.context.createAnalyser();
      op.analyser.fftSize = 2048;
      op.source.connect(op.analyser);
      const samples = new Float32Array(op.analyser.fftSize);
      let lastSample = now();
      function sample() {
        if (!isCurrent(op)) return;
        try {
          op.analyser.getFloatTimeDomainData(samples);
          const measured = measureMicrophoneLevel(samples);
          const time = now();
          const intensity = projectMicrophoneLevel(
            measured.dbfs,
            state.intensity,
            time - lastSample,
            state.controls,
          );
          lastSample = time;
          update({ ...measured, intensity });
          op.timer = setTimeout(sample, SAMPLE_MS);
        } catch (error) {
          fail(
            op,
            error,
            'MIC_RESEARCH_ANALYSIS_FAILED',
            '輸入分析已停止，請重新開始。',
          );
        }
      }
      clearTimeout(op.watchdog);
      release(op.lease);
      op.lease = null;
      update({
        status: 'running',
        settings: {
          sampleRate: settings.sampleRate ?? op.context.sampleRate,
          channelCount: settings.channelCount ?? null,
          autoGainControl: settings.autoGainControl ?? null,
          noiseSuppression: settings.noiseSuppression ?? null,
          echoCancellation: settings.echoCancellation ?? null,
        },
      });
      op.timer = setTimeout(sample, SAMPLE_MS);
      return true;
    } catch (error) {
      fail(
        op,
        error,
        'MIC_RESEARCH_START_FAILED',
        error?.name === 'NotAllowedError'
          ? '麥克風存取未獲允許，請確認系統權限後重試。'
          : '無法啟動所選輸入，請確認裝置後重試。',
      );
      return false;
    }
  }
  async function deviceChanged() {
    const op = current;
    if (!op || state.status !== 'running') return;
    try {
      const devices = availableDevices(await mediaDevices.enumerateDevices());
      if (!isCurrent(op)) return;
      update({ devices });
      if (!devices.some((device) => device.id === state.selectedDeviceId))
        stop('lost', '所選輸入已移除，請重新讀取並選擇裝置。');
    } catch (error) {
      fail(
        op,
        error,
        'MIC_RESEARCH_DEVICE_FAILED',
        '無法確認輸入裝置，請重新讀取裝置。',
      );
    }
  }
  function configure(input) {
    update({
      controls: normalizeMicrophoneControls({ ...state.controls, ...input }),
    });
  }
  function destroy() {
    stop();
    destroyed = true;
    mediaDevices?.removeEventListener('devicechange', deviceChanged);
  }
  mediaDevices?.addEventListener('devicechange', deviceChanged);
  publish(state);
  return {
    refreshDevices,
    selectDevice,
    start,
    stop: () => stop(),
    configure,
    destroy,
  };
}
