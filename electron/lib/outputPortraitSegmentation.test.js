import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { maskEdge } from '../../shared/outputPortraitImage.json';
import {
  createOutputPortraitSegmentation,
  portraitModel,
} from './outputPortraitSegmentation.js';

const resourcesRoot = path.resolve(import.meta.dirname, '../../resources');
const workerPath = path.join(import.meta.dirname, 'outputPortraitWorker.js');

function portraitSample() {
  const rgba = new Uint8Array(maskEdge ** 2 * 4);
  for (let y = 0; y < maskEdge; y++) {
    for (let x = 0; x < maskEdge; x++) {
      const dx = (x - maskEdge / 2) / maskEdge;
      const dy = y / maskEdge;
      const hair = Math.hypot(dx, dy - 0.35) < 0.23;
      const face = Math.hypot(dx, dy - 0.37) < 0.18;
      const shirt = dy > 0.55 && dy < 0.9 && Math.abs(dx) < dy * 0.24;
      const color = face
        ? [234, 178, 142, 255]
        : hair
          ? [28, 33, 52, 255]
          : shirt
            ? [126, 80, 162, 255]
            : [216, 219, 223, 255];
      rgba.set(color, (y * maskEdge + x) * 4);
    }
  }
  return rgba;
}

it('uses the shipped ONNX weights for first and subsequent offline portrait inference', async () => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('Offline'));
  try {
    const logger = { error: vi.fn() };
    const segment = createOutputPortraitSegmentation({
      resourcesRoot,
      workerPath,
      logger,
    });
    const rgba = portraitSample();
    const signal = new AbortController().signal;
    const first = await segment(rgba, signal);
    expect(first.status).toBe('ok');
    expect(first.alpha).toHaveLength(maskEdge ** 2);
    const face = Math.floor(maskEdge * 0.37) * maskEdge + maskEdge / 2;
    expect(first.alpha[face]).toBeGreaterThan(224);
    expect(first.alpha[0]).toBeLessThan(31);
    expect(await segment(rgba, signal)).toEqual(first);
    expect(fetch).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it('reports missing or altered built-in weights and can retry', async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'utawakui-portrait-'),
  );
  try {
    const logger = { error: vi.fn() };
    const filename = path.join(directory, portraitModel.relativePath);
    const segment = createOutputPortraitSegmentation({
      resourcesRoot: directory,
      workerPath,
      logger,
    });
    const rgba = portraitSample();
    const signal = new AbortController().signal;
    await expect(segment(rgba, signal)).resolves.toEqual({
      status: 'model-unavailable',
    });
    await fs.mkdir(path.dirname(filename));
    await fs.writeFile(filename, Buffer.alloc(portraitModel.expectedSize));
    await expect(segment(rgba, signal)).resolves.toEqual({
      status: 'model-unavailable',
    });
    expect(logger.error).toHaveBeenCalledTimes(2);
    await fs.copyFile(
      path.join(resourcesRoot, portraitModel.relativePath),
      filename,
    );
    await expect(segment(rgba, signal)).resolves.toMatchObject({
      status: 'ok',
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
