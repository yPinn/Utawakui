import { copyFile, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { planVideoFormats } from '../../electron/lib/trackVideoFormats.js';

async function stageVideo({ dir, inspect, acquire, signal }) {
  signal?.throwIfAborted();
  const staging = await mkdtemp(join(dir, 'mv-stage-'));
  const filePath = join(staging, 'video.mp4');
  const discard = () => rm(staging, { recursive: true, force: true });

  try {
    if (acquire.localPath) {
      await copyFile(acquire.localPath, filePath);
    } else {
      await acquire.download(filePath, signal);
    }
    signal?.throwIfAborted();
    const metadata = await inspect(filePath);
    signal?.throwIfAborted();
    return {
      metadata,
      async publish(destination) {
        signal?.throwIfAborted();
        await rename(filePath, destination);
        await discard();
      },
      discard,
    };
  } catch (error) {
    await discard();
    throw error;
  }
}

export { planVideoFormats, stageVideo };
