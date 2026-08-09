'use strict';

// DSP pipeline: ffmpeg decode -> chunked STFT -> onnxruntime-node inference
// (UVR_MDXNET_KARA_2) -> overlap-add -> ISTFT -> a single 4-channel
// stems.wav (instrumental L/R + vocals L/R). Pure Node, no Electron API
// calls. Ported from nomadkaraoke/python-audio-separator's MDXSeparator
// (architectures/mdx_separator.py + uvr_lib_v5/stft.py), with enable_denoise
// on (see ENABLE_DENOISE below) — without it the instrumental stem had
// noticeable vocal residue.
//
// CPU-bound and slow (tens of seconds per track) — callers MUST run this
// off the Electron main thread (see vocalSeparationWorker.js) or the
// utawakui-media:// protocol handler will stall for the duration.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ort = require('onnxruntime-node');
const KissFFT = require('kissfft-js');

// ---- UVR_MDXNET_KARA_2 model config ----
// Not guessed — this is the model's actual entry from
// TRvlvr/application_data's mdx_model_data/model_data_new.json. Constants
// for this one model, not a generic multi-model framework.
const N_FFT = 5120;
const HOP_LENGTH = 1024; // hard-coded in UVR itself, not a per-model value
const DIM_F = 2048;
const DIM_T = 256; // 2 ** mdx_dim_t_set(8)
const SEGMENT_SIZE = 256; // == DIM_T -> upstream's pure-onnxruntime path applies
const OVERLAP = 0.25; // upstream CLI default for MDX arch
const COMPENSATE = 1.065;
const SAMPLE_RATE = 44100; // these models expect 44.1kHz; source is often 48kHz
const CHANNELS = 2;
const N_BINS = N_FFT / 2 + 1; // 2561

const MODEL_FILENAME = 'UVR_MDXNET_KARA_2.onnx';
const MODEL_DOWNLOAD_URL =
  'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/UVR_MDXNET_KARA_2.onnx';
const MODEL_EXPECTED_SIZE = 52786726;

// ---------------------------------------------------------------------------
// Windows — two different Hann windows at two different layers; mixing them
// up produces subtly wrong results without crashing:
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
// Always full N_BINS width — callers truncate to/zero-pad from DIM_F.
function stftChannel(samples, window) {
  const padded = reflectPad(samples, N_FFT / 2);
  const numFrames = 1 + Math.floor((padded.length - N_FFT) / HOP_LENGTH);
  const real = new Array(numFrames);
  const imag = new Array(numFrames);
  const fftr = new KissFFT.FFTR(N_FFT);
  const frameBuf = new Float32Array(N_FFT);
  try {
    for (let f = 0; f < numFrames; f++) {
      const start = f * HOP_LENGTH;
      for (let i = 0; i < N_FFT; i++) {
        frameBuf[i] = padded[start + i] * window[i];
      }
      const spectrum = fftr.forward(frameBuf); // interleaved re/im, length N_FFT+2
      const re = new Float32Array(N_BINS);
      const im = new Float32Array(N_BINS);
      for (let b = 0; b < N_BINS; b++) {
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
function istftChannel(real, imag, numFrames, window, outputLength) {
  const paddedLength = outputLength + N_FFT;
  const output = new Float64Array(paddedLength);
  const envelope = new Float64Array(paddedLength);
  const fftr = new KissFFT.FFTR(N_FFT);
  const spectrum = new Float32Array(N_FFT + 2);
  try {
    for (let f = 0; f < numFrames; f++) {
      for (let b = 0; b < N_BINS; b++) {
        spectrum[2 * b] = real[f][b];
        spectrum[2 * b + 1] = imag[f][b];
      }
      const frame = fftr.inverse(spectrum); // unscaled, length N_FFT
      const start = f * HOP_LENGTH;
      for (let i = 0; i < N_FFT; i++) {
        const sample = (frame[i] / N_FFT) * window[i];
        output[start + i] += sample;
        envelope[start + i] += window[i] * window[i];
      }
    }
  } finally {
    fftr.dispose();
  }
  const trimmed = new Float32Array(outputLength);
  const trim = N_FFT / 2;
  const EPS = 1e-8;
  for (let i = 0; i < outputLength; i++) {
    const idx = trim + i;
    trimmed[i] = envelope[idx] > EPS ? output[idx] / envelope[idx] : 0;
  }
  return trimmed;
}

// ffmpeg decode -> raw interleaved float32 PCM. -ar/-ac pinned explicitly —
// a 48kHz source decoded without resampling would come out pitch-shifted,
// not just lower quality.
function decodeAudio(inputPath) {
  return new Promise((resolve, reject) => {
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
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
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

// Denoise (matches python-audio-separator's enable_denoise): run the model
// twice per chunk — spectrum as-is, and its negation — combine as
// (pos - neg) / 2. Suppresses residual artifacts (e.g. vocal bleed in the
// instrumental). Doubles inference time; accepted for a non-real-time job.
const ENABLE_DENOISE = true;

async function runInference(session, inputData) {
  const inputTensor = new ort.Tensor('float32', inputData, [
    1,
    4,
    DIM_F,
    DIM_T,
  ]);
  const feeds = { [session.inputNames[0]]: inputTensor };
  const results = await session.run(feeds);
  const outputTensor = results[session.outputNames[0]];

  const expectedDims = [1, 4, DIM_F, DIM_T];
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
async function runModel(session, window, chunkL, chunkR) {
  const stftL = stftChannel(chunkL, window);
  const stftR = stftChannel(chunkR, window);
  const numFrames = stftL.numFrames; // == DIM_T by construction of chunkSize

  if (numFrames !== DIM_T) {
    throw new Error(
      `Expected ${DIM_T} STFT frames per chunk, got ${numFrames} — chunk_size math is wrong.`,
    );
  }

  const planeSize = DIM_F * DIM_T;
  const inputData = new Float32Array(4 * planeSize);
  const fillPlane = (planeIndex, arr) => {
    const offset = planeIndex * planeSize;
    for (let t = 0; t < numFrames; t++) {
      for (let b = 0; b < DIM_F; b++) {
        inputData[offset + b * DIM_T + t] = arr[t][b];
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
        inputData[plane * planeSize + b * DIM_T + t] = 0;
      }
    }
  }

  const posOutput = await runInference(session, inputData);

  let spec;
  if (ENABLE_DENOISE) {
    const negInput = new Float32Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) negInput[i] = -inputData[i];
    const negOutput = await runInference(session, negInput);
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
      const row = new Float32Array(N_BINS); // bins >= DIM_F stay 0
      for (let b = 0; b < DIM_F; b++) {
        row[b] = spec[offset + b * DIM_T + t];
      }
      arr.push(row);
    }
    return arr;
  };

  const lReal = unpack(0);
  const lImag = unpack(1);
  const rReal = unpack(2);
  const rImag = unpack(3);

  const outL = istftChannel(lReal, lImag, numFrames, window, chunkL.length);
  const outR = istftChannel(rReal, rImag, numFrames, window, chunkR.length);
  return [outL, outR];
}

// Full-track demix: padded overlapping chunks, model inference per chunk,
// windowed overlap-add reassembly. Mirrors MDXSeparator.demix()'s
// non-is_match_mix, non-checkpoint path.
async function demixSong(session, mixL, mixR, onProgress) {
  const window = hannWindowPeriodic(N_FFT);
  const trim = N_FFT / 2;
  const chunkSize = HOP_LENGTH * (SEGMENT_SIZE - 1); // 261120
  const genSize = chunkSize - 2 * trim;
  const n = mixL.length;
  const pad = genSize + trim - (n % genSize);

  const total = trim + n + pad;
  const padL = new Float32Array(total);
  const padR = new Float32Array(total);
  padL.set(mixL, trim);
  padR.set(mixR, trim);

  const step = Math.floor((1 - OVERLAP) * chunkSize);
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
    const [outL, outR] = await runModel(session, window, chunkL, chunkR);

    const chunkWin = OVERLAP !== 0 ? hannWindowSymmetric(chunkLenActual) : null;
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

// Secondary stem (Vocals) = -(primary * compensate) + normalized mix.
// Subtracts against the NORMALIZED mix, not raw input — that's upstream's
// (invert_using_spec=False) behavior, not a bug in the port.
function computeSecondary(primaryPeakScale, normalizedMix) {
  const out = new Float32Array(primaryPeakScale.length);
  for (let i = 0; i < primaryPeakScale.length; i++) {
    out[i] = -primaryPeakScale[i] * COMPENSATE + normalizedMix[i];
  }
  return out;
}

// Pure encode — no filesystem access, kept separate from writeWavAtomic so
// it's directly unit-testable. `channels` is interleaved in the order
// given — for stems.wav that's [instL, instR, vocL, vocR] (see
// library.js's SEPARATED_VARIANTS comment for the player-side half of this
// fixed order).
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
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, filePath);
}

// Writes a single 4-channel stems.wav (0/1 instrumental L/R, 2/3 vocals
// L/R — see library.js's SEPARATED_VARIANTS comment) into outputDir. One
// file, not two, so playback stays sample-accurate: two independently-
// decoded files drifting out of sync produces audible comb filtering.
//
// onProgress stages fire in pipeline order: loading-model (the ~50MB ONNX
// session, built fresh every call — not ensureModel's one-time download,
// which the caller reports separately) -> decoding -> separating
// (per-chunk) -> writing.
async function separateTrack(inputPath, outputDir, modelPath, onProgress) {
  fs.mkdirSync(outputDir, { recursive: true });

  onProgress?.({ stage: 'loading-model' });
  const session = await ort.InferenceSession.create(modelPath);

  onProgress?.({ stage: 'decoding' });
  const { left, right } = await decodeAudio(inputPath);

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
  );
  const primaryL = Float32Array.from(primaryNormL, (v) => v * peak);
  const primaryR = Float32Array.from(primaryNormR, (v) => v * peak);

  const secondaryL = computeSecondary(primaryL, normL);
  const secondaryR = computeSecondary(primaryR, normR);

  onProgress?.({ stage: 'writing' });
  const stemsPath = path.join(outputDir, 'stems.wav');
  writeWavAtomic(
    stemsPath,
    [primaryL, primaryR, secondaryL, secondaryR],
    SAMPLE_RATE,
  );

  return { stemsPath };
}

// Downloads the model on first use into <userDataDir>/models/. A download
// interrupted mid-write must not leave a file at the final path — same
// .tmp + rename reasoning as writeWavAtomic above.
async function ensureModel(userDataDir) {
  const modelDir = path.join(userDataDir, 'models');
  const modelPath = path.join(modelDir, MODEL_FILENAME);
  if (fs.existsSync(modelPath)) return modelPath;

  fs.mkdirSync(modelDir, { recursive: true });

  // Not https.get — this URL 302-redirects to an Azure blob, and fetch()
  // follows redirects by default.
  const response = await fetch(MODEL_DOWNLOAD_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download vocal separation model: HTTP ${response.status}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length !== MODEL_EXPECTED_SIZE) {
    throw new Error(
      `Downloaded model size ${buffer.length} doesn't match expected ${MODEL_EXPECTED_SIZE} — download may be incomplete.`,
    );
  }

  const tmpPath = `${modelPath}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, modelPath);
  return modelPath;
}

module.exports = {
  separateTrack,
  ensureModel,
  encodeWav,
};
