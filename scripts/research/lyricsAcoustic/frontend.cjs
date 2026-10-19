'use strict';

// Standalone process: the coordinator owns FFmpeg and Python as sibling processes.
const fs = require('node:fs');
const path = require('node:path');
const { recipe } = require('./protocol.cjs');
let session, workspace;

async function handle(request) {
  if (request.command === 'initialize' && !session) {
    const ort = require('onnxruntime-node');
    workspace = fs.realpathSync(request.workspace);
    session = await ort.InferenceSession.create(
      path.join(request.modelDir, 'model.onnx'),
      {
        executionProviders: ['cpu'],
        intraOpNumThreads: 4,
        interOpNumThreads: 1,
      },
    );
    return { ready: true, peakRssBytes: process.resourceUsage().maxRSS * 1024 };
  }
  if (
    request.command !== 'infer' ||
    !session ||
    !/^window-\d{1,5}$/.test(request.prefix)
  )
    throw new Error('invalid request');
  const pcm = fs.readFileSync(path.join(workspace, `${request.prefix}.pcm`));
  if (
    !pcm.length ||
    pcm.length % 4 ||
    pcm.length > (recipe.sampleRate * 4 * recipe.maxWindowMs) / 1000
  )
    throw new Error('waveform budget');
  const waveform = new Float32Array(
    pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length),
  );
  if (!waveform.every(Number.isFinite)) throw new Error('invalid waveform');
  const ort = require('onnxruntime-node');
  const outputs = await session.run({
    waveform: new ort.Tensor('float32', waveform, [1, waveform.length]),
  });
  const frame = outputs.ph_frame_logits,
    edge = outputs.ph_edge_logits;
  const frames = frame?.dims?.[2];
  if (
    frame?.type !== 'float32' ||
    edge?.type !== 'float32' ||
    frame.dims.length !== 3 ||
    frame.dims[0] !== 1 ||
    frame.dims[1] !== 144 ||
    edge.dims.length !== 2 ||
    edge.dims[0] !== 1 ||
    edge.dims[1] !== frames ||
    frames > 3004 ||
    frames < 1
  )
    throw new Error('logit shape');
  for (const [kind, tensor] of [
    ['frame', frame],
    ['edge', edge],
  ])
    fs.writeFileSync(
      path.join(workspace, `${request.prefix}-${kind}.bin`),
      Buffer.from(
        tensor.data.buffer,
        tensor.data.byteOffset,
        tensor.data.byteLength,
      ),
    );
  return { frames, peakRssBytes: process.resourceUsage().maxRSS * 1024 };
}

let input = Buffer.alloc(0),
  busy = false;
process.stdin.on('data', (chunk) => {
  if (busy) {
    process.exitCode = 1;
    process.stdin.destroy();
    return;
  }
  input = Buffer.concat([input, chunk]);
  if (input.length > recipe.maxMessageBytes) {
    process.exit(1);
  }
  const newline = input.indexOf(10);
  if (newline === -1) return;
  if (newline !== input.length - 1) process.exit(1);
  let request;
  try {
    request = JSON.parse(input.toString('utf8'));
  } catch {
    process.exit(1);
  }
  input = Buffer.alloc(0);
  busy = true;
  handle(request)
    .then(
      (result) =>
        process.stdout.write(
          `${JSON.stringify({ id: request.id, ok: true, result })}\n`,
        ),
      () =>
        process.stdout.write(
          `${JSON.stringify({ id: request.id, ok: false, code: 'RESEARCH_FRONTEND_FAILED' })}\n`,
        ),
    )
    .finally(() => {
      busy = false;
    });
});
process.stdin.on('end', async () => {
  await session?.release();
});
