import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import {
  buildPageData,
  scriptJSON,
  createListeningServer,
} from './listeningPage.cjs';

const sample = {
  sampleId: 'r-001',
  text: '春天花開',
  cuts: [2],
  startMs: 1000,
  endMs: 5000,
  durationMs: 8000,
  audioSha256: 'a'.repeat(64),
};
it('keeps original labels and canonical offsets while adding only the selected model proposals', () => {
  const original = { corpusSha256: 'b'.repeat(64), samples: [sample] };
  const labels = {
    schemaVersion: 1,
    corpusSha256: original.corpusSha256,
    entries: [],
  };
  const candidates = Object.fromEntries(
    ['qwen', 'hubertfa', 'qwen-small-fold', 'hubertfa-small-fold'].map((m) => [
      m,
      [
        {
          canonical: { lines: [{ text: sample.text }] },
          estimate: {
            preview: {
              lines: [
                {
                  status: 'ready',
                  chunks: [{ from: 0, to: 4, startMs: 1000 }],
                },
              ],
            },
          },
        },
      ],
    ]),
  );
  const data = buildPageData(
    original,
    labels,
    [
      {
        sampleId: 'r-001',
        caseId: 'zh-1',
        lineIndex: 0,
        priority: 'P0',
        reason: 'test',
      },
    ],
    [{ id: 'zh-1' }],
    candidates,
  );
  expect(data.samples).toHaveLength(1);
  expect(data.samples[0].cuts).toEqual([2]);
  expect(data.samples[0].proposals.hubertfa.chunks[0].to).toBe(4);
  expect(data.labels).toEqual(labels);
  expect(original.samples[0].proposals).toBeUndefined();
  expect(() =>
    buildPageData(original, labels, [{ sampleId: 'r-999' }], [], candidates),
  ).toThrow();
});
it('escapes active HTML and unicode separators in embedded private lyric data', () => {
  const encoded = scriptJSON({ text: '</script><img onerror=bad>\u2028' });
  expect(encoded).not.toContain('<');
  expect(JSON.parse(encoded).text).toBe('</script><img onerror=bad>\u2028');
});
it('handles exact local routes and ranges without opening sockets; refuses traversal and writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listening-http-'));
  fs.writeFileSync(path.join(dir, 'index.html'), 'hello');
  fs.writeFileSync(path.join(dir, 'test.wav'), Buffer.from('0123456789'));
  const server = createListeningServer(
    new Map([
      ['/', { file: path.join(dir, 'index.html'), type: 'text/html' }],
      ['/audio.wav', { file: path.join(dir, 'test.wav'), type: 'audio/wav' }],
    ]),
  );
  async function request(url = '/', options = {}) {
    const chunks = [],
      headers = new Map();
    const response = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(chunk);
        done();
      },
    });
    response.socket = { localPort: 18743 };
    response.setHeader = (name, value) =>
      headers.set(name.toLowerCase(), String(value));
    response.writeHead = (status, values = {}) => {
      response.status = status;
      for (const [k, v] of Object.entries(values)) response.setHeader(k, v);
      return response;
    };
    const finished = new Promise((resolve, reject) => {
      response.once('finish', resolve);
      response.once('error', reject);
    });
    server.emit(
      'request',
      {
        url,
        method: options.method ?? 'GET',
        headers: { host: '127.0.0.1:18743', ...options.headers },
      },
      response,
    );
    await finished;
    return {
      status: response.status,
      headers,
      text: Buffer.concat(chunks).toString(),
    };
  }
  try {
    const response = await request('/audio.wav', {
      headers: { range: 'bytes=2-5' },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.text).toBe('2345');
    expect(
      (await request('/audio.wav', { headers: { range: 'bytes=50-' } })).status,
    ).toBe(416);
    expect((await request('/?file=../secret')).status).toBe(404);
    expect((await request('/unknown')).status).toBe(404);
    expect((await request('/', { method: 'POST' })).status).toBe(405);
    expect(
      (await request('/', { headers: { host: 'attacker.invalid' } })).status,
    ).toBe(403);
    expect((await request()).headers.get('content-security-policy')).toContain(
      "connect-src 'none'",
    );
    expect(
      (await request('/', { method: 'HEAD' })).headers.get('content-length'),
    ).toBe('5');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
