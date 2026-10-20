import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runResearchPreview, wav } from './engine.js';
let root, input, options, dependencies, controller;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-preview-'));
  fs.writeFileSync(path.join(root, 'original.wav'), 'original audio');
  controller = new AbortController();
  input = {
    source: { filename: 'main.vtt', offsetMs: 0 },
    sourceLabel: 'main.vtt',
    audioPath: path.join(root, 'original.wav'),
    audioFilename: 'audio.wav',
    text: 'original lyrics',
    durationMs: 10000,
    canonical: {
      lines: [
        { lineId: 'a', text: '今天一起唱歌', startMs: 1000, endMs: 4000 },
        {
          lineId: 'b',
          text: '原生歌詞',
          startMs: 4000,
          endMs: 6000,
          segments: [
            { text: '原生', startMs: 4000, endMs: 5000 },
            { text: '歌詞', startMs: 5000, endMs: 6000 },
          ],
        },
        { lineId: 'c', text: 'HATE ME', startMs: 6000, endMs: 8000 },
      ],
    },
  };
  options = {
    signal: controller.signal,
    onProgress: vi.fn(),
    language: 'zh',
    lineIndex: 0,
    config: {
      modelDir: path.join(root, 'models/hubertfa/model'),
      ffmpegPath: 'main-owned',
    },
    jobsRoot: path.join(root, 'jobs'),
  };
  dependencies = {
    verifyInstalled: vi.fn(),
    verifyAssets: vi.fn(async () => ({ assertCurrent: vi.fn() })),
    startResearchJob: vi.fn(({ trackDir, canonical }) => {
      expect(trackDir).not.toBe(root);
      expect(fs.readFileSync(path.join(trackDir, 'audio.wav'), 'utf8')).toBe(
        'original audio',
      );
      return {
        cancel: vi.fn(),
        result: Promise.resolve({
          estimate: {
            preview: {
              lines: canonical.lines.map((line, i) => ({
                lineId: line.lineId,
                status: i === 0 ? 'ready' : 'unsupported',
                chunks:
                  i === 0
                    ? [
                        { from: 0, to: 2, startMs: 1000 },
                        { from: 2, to: 6, startMs: 2000 },
                      ]
                    : [],
              })),
            },
          },
        }),
      };
    }),
    ownedGroup: (_signal, run) =>
      run({
        capture: vi.fn(async (_exe, args) =>
          Buffer.from(
            new Float32Array(
              Math.round(Number(args[args.indexOf('-t') + 1]) * 16000),
            ).fill(0.1).buffer,
          ),
        ),
      }),
    whisper: vi.fn(async () => [
      { text: '今天一起唱歌', start: 1, end: 1, boundary: true },
    ]),
  };
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
describe('bounded research preview orchestration', () => {
  it('retains T1 on locally silent lines even if alignment and ASR hallucinate matching content', async () => {
    dependencies.ownedGroup = (_signal, run) =>
      run({
        capture: async (_exe, args) =>
          Buffer.alloc(
            Math.round(Number(args[args.indexOf('-t') + 1]) * 64000),
          ),
      });
    const result = await runResearchPreview(input, options, dependencies);
    expect(result.lines[0]).toMatchObject({
      mode: 'T1',
      chunks: [],
      content: 'silence',
    });
    expect(result.lines[1].mode).toBe('T2');
  });
  it('keeps weak English evidence as T1 and reports real stage window counts', async () => {
    input.canonical.lines[0].text = 'I will always love you';
    options.language = 'en';
    dependencies.whisper.mockResolvedValueOnce([]);
    const result = await runResearchPreview(input, options, dependencies);
    expect(result.lines[0]).toMatchObject({
      mode: 'T1',
      content: 'insufficient',
    });
    expect(options.onProgress).toHaveBeenCalledWith({
      stage: 'content',
      completed: 2,
      total: 2,
    });
  });
  it('whole-song processing includes later occurrences while preview stays bounded', async () => {
    input.durationMs = 90000;
    input.canonical.lines.push({
      lineId: 'later',
      text: '今天一起唱歌',
      startMs: 60000,
      endMs: 64000,
    });
    const preview = await runResearchPreview(input, options, dependencies);
    expect(preview.lines).toHaveLength(3);
    const result = await runResearchPreview(
      input,
      { ...options, wholeSong: true },
      dependencies,
    );
    expect(result.lines).toHaveLength(4);
    expect(result.lines.at(-1).lineId).toBe('later');
    expect(result.lines[1].mode).toBe('T2');
    expect(dependencies.whisper).toHaveBeenCalledTimes(3);
    expect(fs.readdirSync(options.jobsRoot)).toEqual([]);
  });
  it('isolates writes and keeps native T2 and unsupported T1 fallback with a pending acceptance', async () => {
    const original = structuredClone(input);
    const result = await runResearchPreview(input, options, dependencies);
    expect(result.timingAcceptance).toBe('pending');
    expect(result.lines.map((l) => l.mode)).toEqual(['research', 'T2', 'T1']);
    expect(result.lines[1].segments).toEqual(input.canonical.lines[1].segments);
    expect(input).toEqual(original);
    expect(fs.readdirSync(options.jobsRoot)).toEqual([]);
    expect(fs.readFileSync(input.audioPath, 'utf8')).toBe('original audio');
    expect(dependencies.verifyInstalled).toHaveBeenCalledTimes(2);
  });
  it('removes contradicted model chunks and keeps missing evidence unknown', async () => {
    dependencies.whisper.mockResolvedValueOnce([
      { text: '明晚快樂旅行', start: 1, end: 1, boundary: true },
    ]);
    const result = await runResearchPreview(input, options, dependencies);
    expect(result.lines[0]).toMatchObject({
      mode: 'T1',
      chunks: [],
      content: 'contradiction',
    });
    dependencies.whisper.mockResolvedValueOnce([]);
    expect(
      (await runResearchPreview(input, options, dependencies)).lines[0],
    ).toMatchObject({ mode: 'research', content: 'insufficient' });
  });
  it('cancels the HFA job, waits for its result, and clears temporary copies', async () => {
    let fail;
    const cancel = vi.fn(async () => fail(Error('cancelled')));
    dependencies.startResearchJob.mockImplementation(() => ({
      cancel,
      result: new Promise((_resolve, reject) => {
        fail = reject;
      }),
    }));
    const running = runResearchPreview(input, options, dependencies);
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
    controller.abort();
    await expect(running).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
    expect(fs.readdirSync(options.jobsRoot)).toEqual([]);
    expect(dependencies.whisper).not.toHaveBeenCalled();
  });
  it('publishes nothing on small failure, invalid PCM or damaged assets', async () => {
    dependencies.whisper.mockRejectedValueOnce(Error('small load failure'));
    await expect(
      runResearchPreview(input, options, dependencies),
    ).rejects.toThrow('small load');
    expect(fs.readdirSync(options.jobsRoot)).toEqual([]);
    dependencies.ownedGroup = (_signal, run) =>
      run({ capture: async () => Buffer.alloc(3) });
    await expect(
      runResearchPreview(input, options, dependencies),
    ).rejects.toThrow('PCM');
    expect(fs.readdirSync(options.jobsRoot)).toEqual([]);
    dependencies.verifyInstalled.mockRejectedValueOnce(Error('tampered'));
    await expect(
      runResearchPreview(input, options, dependencies),
    ).rejects.toThrow('tampered');
  });
  it('declines an untimed line and preserves the 16 kHz float WAV envelope', async () => {
    options.lineIndex = 99;
    await expect(
      runResearchPreview(input, options, dependencies),
    ).rejects.toThrow('timed');
    const bytes = wav(Buffer.alloc(64000));
    expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(bytes.readUInt32LE(24)).toBe(16000);
    expect(bytes.length).toBe(64044);
  });
});
