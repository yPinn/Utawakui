'use strict';

// DSP pipeline: ffmpeg decode -> STFT -> ONNX inference -> ISTFT -> per-preset
// 4-channel WAV. separateTrack() is CPU-bound and runs only inside
// vocalSeparationWorker.js. Model download/verification lives in
// featureDependencies.js so Settings can prepare it before a run starts.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const KissFFT = require('kissfft-js');
const { recordSeparationResult } = require('./library');
const { atomicWriteBuffer } = require('./atomicWrite');

// Model values come from UVR model_data.json. primaryStem must be instrumental.
const HOP_LENGTH = 1024; // hard-coded in UVR itself, not a per-model value
const SEGMENT_SIZE = 256; // == every current model's dimT -> upstream's pure-onnxruntime path applies
const SAMPLE_RATE = 44100; // these models expect 44.1kHz; source is often 48kHz
const CHANNELS = 2;

const MODELS = {
  kara2: {
    filename: 'UVR_MDXNET_KARA_2.onnx',
    nFft: 5120,
    dimF: 2048,
    dimT: 256, // 2 ** mdx_dim_t_set(8)
    compensate: 1.065,
    primaryStem: 'instrumental',
  },
  'inst-hq3': {
    filename: 'UVR-MDX-NET-Inst_HQ_3.onnx',
    nFft: 6144,
    dimF: 3072,
    dimT: 256,
    compensate: 1.022,
    primaryStem: 'instrumental',
  },
  // Benchmark candidate only. This model is deliberately absent from the
  // product dependency catalog and public recipe registry until it beats HQ3
  // on the local challenge corpus. Values are keyed by UVR's last-10,240,000
  // byte MD5 0f2a6bc5b49d87d64728ee40e23bceb1.
  'inst-hq4': {
    filename: 'UVR-MDX-NET-Inst_HQ_4.onnx',
    nFft: 5120,
    dimF: 2560,
    dimT: 256,
    compensate: 1.019,
    primaryStem: 'instrumental',
  },
};

// ---------------------------------------------------------------------------
// Two Hann variants are required at different DSP layers:
//   - periodic (denominator N): torch.hann_window(..., periodic=True), used
//     inside the STFT/ISTFT itself.
//   - symmetric (denominator N-1): np.hanning(N), used one level up for
//     cross-chunk overlap-add in demixSong.
function hannWindowPeriodic(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  }
  return w;
}

function hannWindowSymmetric(n) {
  if (n === 1) return new Float32Array([1]);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return w;
}

// torch.stft(..., pad_mode='reflect') semantics: mirror without repeating
// the edge sample (numpy default 'reflect', not 'symmetric').
function reflectPad(samples, pad) {
  const n = samples.length;
  const out = new Float32Array(n + 2 * pad);
  out.set(samples, pad);
  for (let i = 0; i < pad; i++) {
    out[i] = samples[pad - i];
    out[n + pad + i] = samples[n - 2 - i];
  }
  return out;
}

// STFT for one channel (mirrors uvr_lib_v5/stft.py, center=True torch.stft).
// Always full nBins width — callers truncate to/zero-pad from dimF.
function stftChannel(samples, window, nFft) {
  const nBins = nFft / 2 + 1;
  const padded = reflectPad(samples, nFft / 2);
  const numFrames = 1 + Math.floor((padded.length - nFft) / HOP_LENGTH);
  const real = new Array(numFrames);
  const imag = new Array(numFrames);
  const fftr = new KissFFT.FFTR(nFft);
  const frameBuf = new Float32Array(nFft);
  try {
    for (let f = 0; f < numFrames; f++) {
      const start = f * HOP_LENGTH;
      for (let i = 0; i < nFft; i++) {
        frameBuf[i] = padded[start + i] * window[i];
      }
      const spectrum = fftr.forward(frameBuf); // interleaved re/im, length nFft+2
      const re = new Float32Array(nBins);
      const im = new Float32Array(nBins);
      for (let b = 0; b < nBins; b++) {
        re[b] = spectrum[2 * b];
        im[b] = spectrum[2 * b + 1];
      }
      real[f] = re;
      imag[f] = im;
    }
  } finally {
    fftr.dispose();
  }
  return { real, imag, numFrames };
}

// Window-normalized overlap-add reconstruction (the NOLA algorithm
// torch.istft implements internally) + trims the reflect-padding back off.
function istftChannel(real, imag, numFrames, window, outputLength, nFft) {
  const nBins = nFft / 2 + 1;
  const paddedLength = outputLength + nFft;
  const output = new Float64Array(paddedLength);
  const envelope = new Float64Array(paddedLength);
  const fftr = new KissFFT.FFTR(nFft);
  const spectrum = new Float32Array(nFft + 2);
  try {
    for (let f = 0; f < numFrames; f++) {
      for (let b = 0; b < nBins; b++) {
        spectrum[2 * b] = real[f][b];
        spectrum[2 * b + 1] = imag[f][b];
      }
      const frame = fftr.inverse(spectrum); // unscaled, length nFft
      const start = f * HOP_LENGTH;
      for (let i = 0; i < nFft; i++) {
        const sample = (frame[i] / nFft) * window[i];
        output[start + i] += sample;
        envelope[start + i] += window[i] * window[i];
      }
    }
  } finally {
    fftr.dispose();
  }
  const trimmed = new Float32Array(outputLength);
  const trim = nFft / 2;
  const EPS = 1e-8;
  for (let i = 0; i < outputLength; i++) {
    const idx = trim + i;
    trimmed[i] = envelope[idx] > EPS ? output[idx] / envelope[idx] : 0;
  }
  return trimmed;
}

// Decode to fixed 44.1kHz stereo float PCM; the model depends on it.
function decodeAudio(inputPath, ffmpegPath) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error('missing FFmpeg executable path'));
      return;
    }
    const args = [
      '-y',
      '-i',
      inputPath,
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-f',
      'f32le',
      '-',
    ];
    const proc = spawn(ffmpegPath, args);
    const chunks = [];
    let stderr = '';
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        // stderr may contain local file paths — log it for diagnosis but
        // don't forward it through the worker/IPC round-trip to the renderer.
        console.error(`ffmpeg exited with code ${code}:\n${stderr}`);
        reject(
          new Error(`audio decode failed (ffmpeg exited with code ${code})`),
        );
        return;
      }
      const buf = Buffer.concat(chunks);
      const totalSamples = Math.floor(buf.length / 4 / CHANNELS);
      const left = new Float32Array(totalSamples);
      const right = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        left[i] = buf.readFloatLE(i * 2 * 4);
        right[i] = buf.readFloatLE((i * 2 + 1) * 4);
      }
      resolve({ left, right });
    });
  });
}

// Presets choose model, overlap, and denoise. Tensor shape and compensation
// stay model-level, not preset-level.
const SEPARATION_PRESETS = {
  quick: {
    profileId: 'mdx-kara2-v1',
    modelId: 'kara2',
    overlap: 0.25,
    enableDenoise: false,
  },
  general: {
    profileId: 'mdx-inst-hq3-v1',
    modelId: 'inst-hq3',
    overlap: 0.25,
    enableDenoise: true,
  },
  // Internal benchmark route, unreachable from the product recipe trust
  // boundary. Keep it here so the same worker/DSP code compares HQ3 and HQ4.
  'benchmark-hq4': {
    profileId: 'mdx-inst-hq4-candidate-v1',
    modelId: 'inst-hq4',
    overlap: 0.25,
    enableDenoise: true,
  },
  // Legacy execution aliases remain for direct compatibility tests and old
  // artifacts. Main's recipe trust boundary does not allow new runs for them.
  'high-quality': {
    profileId: 'mdx-kara2-denoise-v1',
    modelId: 'kara2',
    overlap: 0.5,
    enableDenoise: true,
  },
};
const LEGACY_PRESET_ALIASES = Object.freeze({
  standard: 'quick',
  clean: 'general',
  'inst-hq3': 'general',
});
const DEFAULT_PRESET_ID = 'general';

function resolvePreset(presetId) {
  const canonicalId = LEGACY_PRESET_ALIASES[presetId] || presetId;
  return (
    SEPARATION_PRESETS[canonicalId] || SEPARATION_PRESETS[DEFAULT_PRESET_ID]
  );
}

function resolveExecutionPreset(presetId, expectedProfileId, expectedModelId) {
  const preset = resolvePreset(presetId);
  if (expectedProfileId && preset.profileId !== expectedProfileId) {
    throw new Error(
      `Separation profile mismatch for recipe "${presetId}": ` +
        `expected "${expectedProfileId}", resolved "${preset.profileId}"`,
    );
  }
  if (expectedModelId && preset.modelId !== expectedModelId) {
    throw new Error(
      `Separation model mismatch for recipe "${presetId}": ` +
        `expected "${expectedModelId}", resolved "${preset.modelId}"`,
    );
  }
  return preset;
}

async function runInference(session, inputData, model) {
  // Lazy require — this file also loads in the main process, which must
  // never load onnxruntime-node/DirectML. See ADR 0002.
  const ort = require('onnxruntime-node');
  const inputTensor = new ort.Tensor('float32', inputData, [
    1,
    4,
    model.dimF,
    model.dimT,
  ]);
  const feeds = { [session.inputNames[0]]: inputTensor };
  const results = await session.run(feeds);
  const outputTensor = results[session.outputNames[0]];

  const expectedDims = [1, 4, model.dimF, model.dimT];
  if (
    outputTensor.dims.length !== 4 ||
    !outputTensor.dims.every((d, i) => d === expectedDims[i])
  ) {
    throw new Error(
      `Model output shape [${outputTensor.dims}] doesn't match expected [${expectedDims}].`,
    );
  }

  return outputTensor.data;
}

// Model inference for one chunk (mirrors MDXSeparator.run_model). Tensor
// plane order: [L_re, L_im, R_re, R_im].
async function runModel(session, window, chunkL, chunkR, enableDenoise, model) {
  const { nFft, dimF, dimT } = model;
  const nBins = nFft / 2 + 1;
  const stftL = stftChannel(chunkL, window, nFft);
  const stftR = stftChannel(chunkR, window, nFft);
  const numFrames = stftL.numFrames; // == dimT by construction of chunkSize

  if (numFrames !== dimT) {
    throw new Error(
      `Expected ${dimT} STFT frames per chunk, got ${numFrames} — chunk_size math is wrong.`,
    );
  }

  const planeSize = dimF * dimT;
  const inputData = new Float32Array(4 * planeSize);
  const fillPlane = (planeIndex, arr) => {
    const offset = planeIndex * planeSize;
    for (let t = 0; t < numFrames; t++) {
      for (let b = 0; b < dimF; b++) {
        inputData[offset + b * dimT + t] = arr[t][b];
      }
    }
  };
  fillPlane(0, stftL.real);
  fillPlane(1, stftL.imag);
  fillPlane(2, stftR.real);
  fillPlane(3, stftR.imag);

  // Zero out the first 3 bins on every plane (low-frequency noise trim).
  for (let plane = 0; plane < 4; plane++) {
    for (let b = 0; b < 3; b++) {
      for (let t = 0; t < numFrames; t++) {
        inputData[plane * planeSize + b * dimT + t] = 0;
      }
    }
  }

  const posOutput = await runInference(session, inputData, model);

  let spec;
  if (enableDenoise) {
    const negInput = new Float32Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) negInput[i] = -inputData[i];
    const negOutput = await runInference(session, negInput, model);
    spec = new Float32Array(posOutput.length);
    for (let i = 0; i < spec.length; i++) {
      spec[i] = (posOutput[i] - negOutput[i]) * 0.5;
    }
  } else {
    spec = posOutput;
  }

  const unpack = (planeIndex) => {
    const offset = planeIndex * planeSize;
    const arr = [];
    for (let t = 0; t < numFrames; t++) {
      const row = new Float32Array(nBins); // bins >= dimF stay 0
      for (let b = 0; b < dimF; b++) {
        row[b] = spec[offset + b * dimT + t];
      }
      arr.push(row);
    }
    return arr;
  };

  const lReal = unpack(0);
  const lImag = unpack(1);
  const rReal = unpack(2);
  const rImag = unpack(3);

  const outL = istftChannel(
    lReal,
    lImag,
    numFrames,
    window,
    chunkL.length,
    nFft,
  );
  const outR = istftChannel(
    rReal,
    rImag,
    numFrames,
    window,
    chunkR.length,
    nFft,
  );
  return [outL, outR];
}

// Full-track demix: padded overlapping chunks, model inference per chunk,
// windowed overlap-add reassembly. Mirrors MDXSeparator.demix()'s
// non-is_match_mix, non-checkpoint path.
async function demixSong(session, mixL, mixR, onProgress, params) {
  const { overlap, enableDenoise, model } = params;
  const window = hannWindowPeriodic(model.nFft);
  const trim = model.nFft / 2;
  const chunkSize = HOP_LENGTH * (SEGMENT_SIZE - 1); // 261120
  const genSize = chunkSize - 2 * trim;
  const n = mixL.length;
  const pad = genSize + trim - (n % genSize);

  const total = trim + n + pad;
  const padL = new Float32Array(total);
  const padR = new Float32Array(total);
  padL.set(mixL, trim);
  padR.set(mixR, trim);

  const step = Math.floor((1 - overlap) * chunkSize);
  const resultL = new Float64Array(total);
  const resultR = new Float64Array(total);
  // L and R accumulate the same window weights by construction (both
  // channels of a chunk always use the identical window) — one shared
  // divider instead of two halves the Float64Array footprint for free.
  const divider = new Float64Array(total);

  // Same iteration count as the loop below (ceil, since the last step can
  // undershoot `total`) — used only to report percent, not to drive the
  // loop itself.
  const totalChunks = Math.ceil(total / step);
  let chunkIndex = 0;

  for (let i = 0; i < total; i += step) {
    const start = i;
    const end = Math.min(i + chunkSize, total);
    const chunkLenActual = end - start;

    let chunkL = padL.subarray(start, end);
    let chunkR = padR.subarray(start, end);
    if (chunkLenActual < chunkSize) {
      const filledL = new Float32Array(chunkSize);
      filledL.set(chunkL);
      chunkL = filledL;
      const filledR = new Float32Array(chunkSize);
      filledR.set(chunkR);
      chunkR = filledR;
    }

    // Sequential by design — inference chunks aren't fanned out in parallel.
    const [outL, outR] = await runModel(
      session,
      window,
      chunkL,
      chunkR,
      enableDenoise,
      model,
    );

    const chunkWin = overlap !== 0 ? hannWindowSymmetric(chunkLenActual) : null;
    for (let k = 0; k < chunkLenActual; k++) {
      const w = chunkWin ? chunkWin[k] : 1;
      resultL[start + k] += outL[k] * w;
      resultR[start + k] += outR[k] * w;
      divider[start + k] += w;
    }

    chunkIndex += 1;
    onProgress?.({
      stage: 'separating',
      percent: Math.round((chunkIndex / totalChunks) * 100),
    });
  }

  const normL = new Float32Array(total);
  const normR = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    normL[i] = divider[i] > 0 ? resultL[i] / divider[i] : 0;
    normR[i] = divider[i] > 0 ? resultR[i] / divider[i] : 0;
  }

  // Undo the outer song-level padding (pad > trim is always true given how
  // `pad` is computed above, so this stays within the trim:-trim slice).
  return [
    Float32Array.from(normL.subarray(trim, trim + n)),
    Float32Array.from(normR.subarray(trim, trim + n)),
  ];
}

function normalizeWave(samples, maxPeak, currentPeak) {
  if (currentPeak <= maxPeak) return samples;
  const scale = maxPeak / currentPeak;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * scale;
  return out;
}

// Secondary stem (Vocals, for every current instrumental-primary model) =
// -(primary * compensate) + normalized mix. Subtracts against the
// NORMALIZED mix, not raw input — that's upstream's
// (invert_using_spec=False) behavior, not a bug in the port.
function computeSecondary(primaryPeakScale, normalizedMix, compensate) {
  const out = new Float32Array(primaryPeakScale.length);
  for (let i = 0; i < primaryPeakScale.length; i++) {
    out[i] = -primaryPeakScale[i] * compensate + normalizedMix[i];
  }
  return out;
}

// Pure encode — no filesystem access, kept separate from writeWavAtomic so
// it's directly unit-testable. `channels` is interleaved in the order
// given — for a separation result that's [instL, instR, vocL, vocR] (see
// electron/lib/library/constants.js's SEPARATIONS_DIRNAME comment for the
// player-side half of this fixed order).
function encodeWav(channels, sampleRate) {
  const numChannels = channels.length;
  const numSamples = channels[0].length;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      buffer.writeInt16LE(Math.round(sample * 32767), offset);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

// A crash mid-write must not leave a file that looks complete — that would
// make hasSeparation() permanently misreport this track as done, with no
// recovery UI. Same .tmp + rename discipline as atomicWrite.js.
function writeWavAtomic(filePath, channels, sampleRate) {
  const buffer = encodeWav(channels, sampleRate);
  try {
    atomicWriteBuffer(filePath, buffer);
  } catch (err) {
    // Per-preset filenames avoid EPERM when switching presets, but not
    // when regenerating the SAME preset that's open for playback.
    if (err.code === 'EPERM') {
      throw new Error('此結果正在播放中,請先停止播放再重新產生。', {
        cause: err,
      });
    }
    throw err;
  }
}

// Writes a single 4-channel <recipeId>.wav (0/1 accompaniment L/R, 2/3
// vocals L/R — see electron/lib/library/constants.js's SEPARATIONS_DIRNAME
// comment) into
// outputDir, one file per preset so switching presets never has to
// overwrite whichever file is currently open for playback. One file per
// result, not two, so playback stays sample-accurate: two independently-
// decoded files drifting out of sync produces audible comb filtering.
//
// onProgress stages fire in pipeline order: loading-model (the ~50MB ONNX
// session, built fresh every call from the Settings-prepared model file) ->
// decoding -> separating (per-chunk) -> writing.
async function separateTrack(
  inputPath,
  outputDir,
  modelPath,
  ffmpegPath,
  onProgress,
  presetId = DEFAULT_PRESET_ID,
  expectedProfileId,
  expectedModelId,
) {
  fs.mkdirSync(outputDir, { recursive: true });
  const preset = resolveExecutionPreset(
    presetId,
    expectedProfileId,
    expectedModelId,
  );
  const model = MODELS[preset.modelId];

  // Every current registry entry is instrumental-primary, which is the
  // assumption the channel write below (0/1 instrumental, 2/3 vocals)
  // hard-codes. A vocals-primary model would silently swap the two
  // channels without this — fail loudly instead of shipping a corrupted
  // result that usePlayer.js's guide-vocal graph can't detect.
  if (model.primaryStem !== 'instrumental') {
    throw new Error(
      `Model "${preset.modelId}" has primaryStem "${model.primaryStem}" — ` +
        'separateTrack only supports instrumental-primary models until the ' +
        'channel-order mapping is extended.',
    );
  }

  const params = {
    overlap: preset.overlap,
    enableDenoise: preset.enableDenoise,
    model,
  };

  onProgress?.({ stage: 'loading-model' });
  // Lazy require — see runInference's require above.
  const ort = require('onnxruntime-node');
  const session = await ort.InferenceSession.create(modelPath);

  onProgress?.({ stage: 'decoding' });
  const { left, right } = await decodeAudio(inputPath, ffmpegPath);

  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const normL = normalizeWave(left, 0.9, peak);
  const normR = normalizeWave(right, 0.9, peak);

  const [primaryNormL, primaryNormR] = await demixSong(
    session,
    normL,
    normR,
    onProgress,
    params,
  );
  const primaryL = Float32Array.from(primaryNormL, (v) => v * peak);
  const primaryR = Float32Array.from(primaryNormR, (v) => v * peak);

  const secondaryL = computeSecondary(primaryL, normL, model.compensate);
  const secondaryR = computeSecondary(primaryR, normR, model.compensate);

  onProgress?.({ stage: 'writing' });
  const stemsPath = path.join(outputDir, `${presetId}.wav`);
  writeWavAtomic(
    stemsPath,
    [primaryL, primaryR, secondaryL, secondaryR],
    SAMPLE_RATE,
  );

  // Manifest update — only after the rename above has succeeded, so a
  // crash mid-write can't leave the manifest claiming a result that
  // doesn't exist on disk. Selects this result (see
  // electron/lib/library/separationManifest.js's recordSeparationResult) —
  // it's what the caller just asked to run.
  recordSeparationResult(outputDir, {
    recipeId: presetId,
    recipeVersion: 1,
    engineId: 'onnx-mdx',
    profileId: preset.profileId,
    modelIds: [preset.modelId],
    artifactFilename: `${presetId}.wav`,
    completedAt: new Date().toISOString(),
    outputLayout: 'accompaniment-guide-4ch',
    ...(presetId === 'high-quality' ? { legacy: true } : {}),
  });

  return { stemsPath };
}

module.exports = {
  separateTrack,
  encodeWav,
  MODELS,
  SEPARATION_PRESETS,
  DEFAULT_PRESET_ID,
  resolvePreset,
  resolveExecutionPreset,
};
