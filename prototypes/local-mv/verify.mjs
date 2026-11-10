import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { getProviderRuntimePaths } from '../../electron/lib/providerRuntime.js';
import { createPythonYtdlpRunner } from '../../electron/lib/pythonYtdlp.js';
import { planVideoFormats, stageVideo } from './asset.mjs';

const exec = promisify(execFile);

async function inspect(filePath) {
  const { stdout } = await exec('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,width,height:format=format_name,duration,size',
    '-of',
    'json',
    filePath,
  ]);
  const {
    streams: [video],
    format,
  } = JSON.parse(stdout);
  assert.equal(video?.codec_name, 'h264');
  assert.ok(format.format_name.split(',').includes('mp4'));
  assert.ok(Number(format.duration) > 0);
  await exec('ffmpeg', [
    '-v',
    'error',
    '-xerror',
    '-i',
    filePath,
    '-frames:v',
    '1',
    '-f',
    'null',
    '-',
  ]);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  const sha256 = hash.digest('hex');
  return {
    width: video.width,
    height: video.height,
    sizeBytes: Number(format.size),
    sha256,
  };
}

async function fixture(dir, width, height) {
  const name = `${height}.mp4`;
  const file = join(dir, name);
  await exec('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${width}x${height}:rate=24`,
    '-t',
    '0.25',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-movflags',
    '+faststart',
    file,
  ]);
  return { name, file, height, size: (await stat(file)).size };
}

async function verify() {
  const pythonPath =
    process.argv[2] ||
    getProviderRuntimePaths(join(process.env.APPDATA, 'Utawakui')).pythonPath;
  const runYtdlp = createPythonYtdlpRunner({
    pythonPath,
    idleTimeoutMs: 20_000,
  });
  const dir = await mkdtemp(join(tmpdir(), 'utawakui-mv-verify-'));
  const files = new Map();
  const server = createServer((request, response) => {
    const entry = files.get(request.url);
    if (!entry || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': entry.size,
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(entry.file).pipe(response);
  });

  try {
    const entries = await Promise.all([
      fixture(dir, 1280, 720),
      fixture(dir, 1920, 1080),
      fixture(dir, 2560, 1440),
    ]);
    for (const entry of entries) files.set(`/${entry.name}`, entry);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const formats = entries.map(({ name, height, size }) => ({
      format_id: name,
      height,
      filesize: size,
      ext: 'mp4',
      vcodec: 'h264',
      acodec: 'none',
    }));
    const fhdPlan = planVideoFormats(formats);
    assert.equal(fhdPlan.defaultId, '1080.mp4');
    assert.equal(planVideoFormats(formats.slice(0, 1)).defaultId, '720.mp4');
    assert.equal(planVideoFormats(formats.slice(2)).defaultId, null);

    const results = [];
    for (const { id, height } of fhdPlan.choices) {
      const route = `/${id}`;
      const url = `http://127.0.0.1:${server.address().port}${route}`;
      const imported = await stageVideo({
        dir,
        inspect,
        acquire: { localPath: files.get(route).file },
      });
      const downloaded = await stageVideo({
        dir,
        inspect,
        acquire: {
          download: (output) =>
            runYtdlp(url, { noPlaylist: true, output, quiet: true }),
        },
      });
      assert.equal(downloaded.metadata.height, height);
      assert.deepEqual(imported.metadata, downloaded.metadata);
      const saved = join(dir, `saved-${id}`);
      await downloaded.publish(saved);
      assert.deepEqual(await inspect(saved), imported.metadata);
      await imported.discard();
      results.push({
        height,
        identical: true,
        sizeBytes: downloaded.metadata.sizeBytes,
      });
    }

    process.stdout.write(
      `${JSON.stringify({ defaultId: fhdPlan.defaultId, results }, null, 2)}\n`,
    );
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}

verify().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
