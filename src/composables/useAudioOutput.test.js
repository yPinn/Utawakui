import { nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function loadAudioOutput({
  initialDeviceId = null,
  applyCaptureDevice,
  prepareCaptureDevice,
  enumeratedDevices = [
    { deviceId: 'default', kind: 'audiooutput', label: 'Default Speakers' },
  ],
  hasMediaDevices = true,
} = {}) {
  const playerState = reactive({
    captureDeviceId: null,
    captureError: null,
  });
  const apply =
    applyCaptureDevice ||
    vi.fn(async (deviceId) => {
      playerState.captureDeviceId = deviceId;
      playerState.captureError = null;
    });
  const prepare =
    prepareCaptureDevice ||
    vi.fn((deviceId) => {
      playerState.captureDeviceId = deviceId;
      playerState.captureError = null;
      return true;
    });
  const setCaptureDevice = vi.fn(async (deviceId) => deviceId);
  const recordError = vi.fn((error, options) => ({
    id: 'audio-output-error',
    severity: 'error',
    ...options,
    technicalMessage: error.message,
  }));

  vi.doMock('./usePlayer.js', () => ({
    usePlayer: () => ({
      state: playerState,
      applyCaptureDevice: apply,
      prepareCaptureDevice: prepare,
    }),
  }));
  vi.doMock('./useAppDiagnostics.js', () => ({
    useAppDiagnostics: () => ({ recordError }),
  }));

  vi.stubGlobal('navigator', {
    mediaDevices: hasMediaDevices
      ? {
          enumerateDevices: vi.fn(async () => enumeratedDevices),
          addEventListener: vi.fn(),
        }
      : undefined,
  });
  vi.stubGlobal('window', {
    Utawakui: {
      initialCaptureDeviceId: initialDeviceId,
      setCaptureDevice,
    },
  });

  const { useAudioOutput } = await import('./useAudioOutput.js');
  return {
    audioOutput: useAudioOutput(),
    applyCaptureDevice: apply,
    prepareCaptureDevice: prepare,
    playerState,
    recordError,
    setCaptureDevice,
  };
}

describe('useAudioOutput', () => {
  it('prepares a valid persisted capture device without opening it or rewriting it', async () => {
    const {
      audioOutput,
      applyCaptureDevice,
      prepareCaptureDevice,
      setCaptureDevice,
    } = await loadAudioOutput({
      initialDeviceId: 'saved-device',
      enumeratedDevices: [
        {
          deviceId: 'saved-device',
          kind: 'audiooutput',
          label: 'Virtual Cable',
        },
      ],
    });

    await audioOutput.restoreInitialDevice();

    expect(prepareCaptureDevice).toHaveBeenCalledWith('saved-device');
    expect(applyCaptureDevice).not.toHaveBeenCalled();
    expect(setCaptureDevice).not.toHaveBeenCalled();
    expect(audioOutput.captureErrorNotice.value).toBeNull();
  });

  it('keeps the safe default when there is no saved device or media API', async () => {
    const { audioOutput, applyCaptureDevice, setCaptureDevice } =
      await loadAudioOutput({ hasMediaDevices: false });

    await audioOutput.restoreInitialDevice();

    expect(applyCaptureDevice).not.toHaveBeenCalled();
    expect(setCaptureDevice).not.toHaveBeenCalled();
    expect(audioOutput.devices.value).toEqual([]);
    expect(audioOutput.monitorDeviceLabel.value).toBe('系統預設輸出');
  });

  it('lists only audio outputs and resolves the current monitor label', async () => {
    const { audioOutput } = await loadAudioOutput({
      enumeratedDevices: [
        { deviceId: 'mic', kind: 'audioinput', label: 'Microphone' },
        { deviceId: 'default', kind: 'audiooutput', label: 'Speakers' },
      ],
    });
    await nextTick();

    expect(audioOutput.devices.value).toEqual([
      { deviceId: 'default', kind: 'audiooutput', label: 'Speakers' },
    ]);
    expect(audioOutput.monitorDeviceLabel.value).toBe('Speakers');
  });

  it('clears a persisted device missing from the enumerated outputs without opening WebAudio', async () => {
    const loaded = await loadAudioOutput({
      initialDeviceId: 'd3371b8a',
    });

    await loaded.audioOutput.restoreInitialDevice();
    await nextTick();

    expect(loaded.prepareCaptureDevice).not.toHaveBeenCalled();
    expect(loaded.applyCaptureDevice).not.toHaveBeenCalled();
    expect(loaded.setCaptureDevice).toHaveBeenCalledWith(null);
    expect(loaded.recordError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        code: 'AUDIO_OUTPUT_DEVICE_UNAVAILABLE',
        source: 'audio-output',
        message: '先前的裝置無法使用。',
        actionLabel: '選擇裝置',
      }),
    );
    expect(loaded.audioOutput.captureErrorNotice.value).toMatchObject({
      title: '擷取輸出已關閉',
      message: '先前的裝置無法使用。',
      actionLabel: '選擇裝置',
    });
    expect(loaded.audioOutput.captureErrorNotice.value.message).not.toContain(
      'd3371b8a',
    );
    expect(loaded.audioOutput.captureErrorNotice.value.message).not.toContain(
      'setSinkId',
    );
  });

  it('clears the notice after a replacement device succeeds', async () => {
    const loaded = await loadAudioOutput({ initialDeviceId: 'stale-device' });

    await loaded.audioOutput.restoreInitialDevice();
    await nextTick();
    await loaded.audioOutput.selectDevice('replacement-device');
    await nextTick();

    expect(loaded.setCaptureDevice).toHaveBeenLastCalledWith(
      'replacement-device',
    );
    expect(loaded.audioOutput.captureErrorNotice.value).toBeNull();
  });

  it('clears the persisted preference when an active capture sink is lost later', async () => {
    const loaded = await loadAudioOutput({
      initialDeviceId: 'saved-device',
      enumeratedDevices: [
        {
          deviceId: 'saved-device',
          kind: 'audiooutput',
          label: 'Virtual Cable',
        },
      ],
    });
    await loaded.audioOutput.restoreInitialDevice();
    loaded.setCaptureDevice.mockClear();

    loaded.playerState.captureDeviceId = null;
    loaded.playerState.captureError = '擷取輸出已停止，請重新選擇裝置。';
    await nextTick();
    await Promise.resolve();

    expect(loaded.setCaptureDevice).toHaveBeenCalledWith(null);
    expect(loaded.audioOutput.captureErrorNotice.value).toMatchObject({
      title: '擷取輸出已關閉',
      message: '先前的裝置無法使用。',
    });
  });

  it('normalizes processing failures without clearing an active device', async () => {
    const loaded = await loadAudioOutput();
    loaded.playerState.captureDeviceId = 'active-device';
    loaded.playerState.captureError = 'worklet registration failed';
    await nextTick();

    expect(loaded.recordError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'worklet registration failed' }),
      expect.objectContaining({
        code: 'AUDIO_OUTPUT_PROCESSING_FAILED',
        message: '請選擇其他裝置。',
      }),
    );
    expect(loaded.audioOutput.captureErrorNotice.value.message).not.toContain(
      'worklet',
    );
    expect(loaded.setCaptureDevice).not.toHaveBeenCalled();
  });
});
