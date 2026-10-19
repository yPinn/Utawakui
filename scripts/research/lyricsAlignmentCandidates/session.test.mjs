import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { createSession } from './job.cjs';
const roots = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((p) => fs.rmSync(p, { recursive: true, force: true })),
);
it('starts Qwen with cache isolation before imports and propagates worker failure', async () => {
  const calls = [];
  const group = {
    rpc: (_exe, args) => {
      calls.push(args);
      return {
        request: async (message) => ({
          id: message.id,
          ok: message.command === 'initialize',
          result: { ready: true },
          error: 'ValueError',
        }),
      };
    },
  };
  const session = await createSession(
    {
      kind: 'qwen',
      config: { pythonPath: 'fixture', vendorDir: 'vendor', modelDir: 'model' },
    },
    group,
    'workspace',
  );
  expect(calls[0]).toContain('-I');
  expect(calls[0]).toContain('-B');
  expect(calls[0]).toContain(
    `pycache_prefix=${path.join('workspace', 'cache')}`,
  );
  expect(await session.initialize()).toEqual({ ready: true });
  await expect(
    session.infer({ prefix: 'w0', text: '你好', language: 'zh' }),
  ).rejects.toThrow('ValueError');
});
it('uses native CPU DTW and preserves UTF-8 merged token boundaries', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-native-'));
  roots.push(root);
  const calls = [];
  const group = {
    capture: async (exe, args) => {
      calls.push([exe, args]);
      fs.writeFileSync(
        path.join(root, 'w0.json'),
        JSON.stringify({
          transcription: [{ tokens: [{ id: 1, text: '你好', t_dtw: 120 }] }],
        }),
      );
      return Buffer.alloc(0);
    },
  };
  const session = await createSession(
    { kind: 'base', config: { whisperPath: 'native', modelPath: 'base.bin' } },
    group,
    root,
  );
  expect((await session.initialize()).loadIncludedInEachWindow).toBe(true);
  const result = await session.infer({
    prefix: 'w0',
    language: 'zh',
    durationSeconds: 5,
  });
  expect(result.spans.map((s) => [s.text, s.start, s.boundary])).toEqual([
    ['你', 1.2, true],
    ['好', 1.2, false],
  ]);
  expect(calls[0][1]).toContain('--no-gpu');
  expect(calls[0][1]).toContain('--no-flash-attn');
  expect(calls[0][1]).toContain('--dtw');
  fs.writeFileSync(path.join(root, 'w0.json'), 'invalid');
  group.capture = async () => Buffer.alloc(0);
  await expect(
    session.infer({ prefix: 'w0', language: 'ja', durationSeconds: 5 }),
  ).rejects.toThrow();
  await expect(
    createSession({ kind: 'unknown', config: {} }, group, root),
  ).rejects.toThrow('kind');
});
it('uses explicit token-start profile, retains bounded raw evidence and declines missing clocks', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-onset-'));
  roots.push(root);
  const workspace = path.join(root, 'job');
  fs.mkdirSync(workspace);
  const config = {
    root,
    whisperPath: 'native',
    modelPath: 'small.bin',
    timestampSource: 'token-start',
    rawEvidenceRoot: path.join(root, 'raw'),
  };
  let tokens = [
    { id: 1, text: 'hello', offsets: { from: 1200, to: 2000 }, t_dtw: 190 },
  ];
  let args;
  const group = {
    capture: async (_exe, parameters) => {
      args = parameters;
      fs.writeFileSync(
        path.join(workspace, 'w0.json'),
        JSON.stringify({ transcription: [{ tokens }] }),
      );
      return Buffer.alloc(0);
    },
  };
  const session = await createSession(
    { kind: 'small', config },
    group,
    workspace,
  );
  const result = await session.infer({
    prefix: 'w0',
    language: 'ja',
    durationSeconds: 5,
  });
  expect(args).not.toContain('--dtw');
  expect(result.spans[0].start).toBe(1.2);
  expect(result.raw.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    fs.existsSync(path.join(config.rawEvidenceRoot, result.raw.filename)),
  ).toBe(true);
  delete config.rawEvidenceRoot;
  tokens = [{ id: 1, text: 'hello', t_dtw: 190 }];
  const declined = await session.infer({
    prefix: 'w0',
    language: 'ja',
    durationSeconds: 5,
  });
  expect(declined.spans).toEqual([]);
  expect(declined.decline).toContain('clock unavailable');
  config.rawEvidenceRoot = path.dirname(root);
  await expect(
    session.infer({ prefix: 'w0', language: 'ja', durationSeconds: 5 }),
  ).rejects.toThrow('evidence boundary');
});
