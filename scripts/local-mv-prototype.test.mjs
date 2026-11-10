import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { planVideoFormats, stageVideo } from '../prototypes/local-mv/asset.mjs';
const format = (height, extra = {}) => ({
  format_id: `mp4-${height}`,
  height,
  ext: 'mp4',
  vcodec: 'avc1.640028',
  acodec: 'none',
  ...extra,
});

it('prefers FHD and exposes compatible higher formats', () => {
  const result = planVideoFormats([format(720), format(2160), format(1080)]);
  expect(result.defaultId).toBe('mp4-1080');
  expect(result.choices.map(({ height }) => height)).toEqual([720, 1080, 2160]);
});

it('falls back to the highest format below FHD and requires a choice for higher-only sources', () => {
  expect(planVideoFormats([format(480), format(720)]).defaultId).toBe(
    'mp4-720',
  );
  expect(planVideoFormats([format(720), format(1440)]).defaultId).toBe(
    'mp4-720',
  );
  expect(planVideoFormats([format(1440)]).defaultId).toBeNull();
});

it('filters incompatible streams and keeps one choice per resolution', () => {
  const result = planVideoFormats([
    format(2160, { dynamic_range: 'HDR10' }),
    format(1440, { vcodec: 'vp9' }),
    format(1080, { format_id: 'combined', acodec: 'aac' }),
    format(1080),
    format(720, { format_id: '../720' }),
  ]);
  expect(result).toEqual({
    defaultId: 'mp4-1080',
    choices: [{ id: 'mp4-1080', height: 1080, sizeBytes: null }],
  });
});

it('treats the Bansanka source sample as 1080p without requiring a 1920px width', () => {
  const result = planVideoFormats([
    format(720),
    format(1080, { format_id: '270', width: 1536, fps: 12 }),
    format(1080, {
      format_id: '137',
      width: 1536,
      fps: 12,
      filesize: 58083776,
    }),
  ]);
  expect(result.defaultId).toBe('137');
  expect(result.choices.at(-1)).toEqual({
    id: '137',
    height: 1080,
    sizeBytes: 58083776,
  });
});

const scratch = [];

afterEach(async () => {
  await Promise.all(
    scratch.splice(0).map((dir) => rm(dir, { recursive: true })),
  );
});

async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), 'utawakui-mv-test-'));
  scratch.push(dir);
  const localPath = join(dir, 'input.mp4');
  await writeFile(localPath, 'same video');
  return { dir, localPath };
}

it('stages both inputs through the same verification', async () => {
  const { dir, localPath } = await workspace();
  const inspect = vi.fn(async (filePath) => {
    expect(await readFile(filePath, 'utf8')).toBe('same video');
    return { height: 1080 };
  });
  const local = await stageVideo({ dir, inspect, acquire: { localPath } });
  const remote = await stageVideo({
    dir,
    inspect,
    acquire: { download: (output) => writeFile(output, 'same video') },
  });
  expect(local.metadata).toEqual(remote.metadata);
  expect(inspect).toHaveBeenCalledTimes(2);
  await local.discard();
  await remote.discard();
  expect(await readdir(dir)).toEqual(['input.mp4']);
});

it('discards failed downloads or invalid candidates without touching the existing input', async () => {
  const { dir, localPath } = await workspace();
  const broken = async () => {
    throw new Error('invalid video');
  };
  await expect(
    stageVideo({ dir, inspect: broken, acquire: { localPath } }),
  ).rejects.toThrow('invalid video');
  await expect(
    stageVideo({ dir, inspect: vi.fn(), acquire: { download: broken } }),
  ).rejects.toThrow('invalid video');
  expect(await readdir(dir)).toEqual(['input.mp4']);
});

it('discards a partially acquired candidate when the transfer is cancelled', async () => {
  const { dir } = await workspace();
  const controller = new AbortController();
  const inspect = vi.fn();
  await expect(
    stageVideo({
      dir,
      inspect,
      signal: controller.signal,
      acquire: {
        async download(output, signal) {
          expect(signal).toBe(controller.signal);
          await writeFile(output, 'partial');
          controller.abort();
        },
      },
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(inspect).not.toHaveBeenCalled();
  expect(await readdir(dir)).toEqual(['input.mp4']);
});
