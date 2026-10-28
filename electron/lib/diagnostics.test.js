import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  createDiagnosticsService,
  normalizeDiagnosticEvent,
  parseDiagnosticJsonLines,
  redactText,
  serializeDiagnosticEvent,
} from './diagnostics.js';

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-diagnostics-'));
  tempDirs.push(dir);
  return dir;
}

function deterministicDefaults(overrides = {}) {
  return {
    now: () => new Date('2026-08-22T00:00:00.000Z'),
    idGenerator: () => 'event-id',
    sessionId: 'session-id',
    process: 'main',
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('normalizeDiagnosticEvent', () => {
  it('creates a bounded versioned event and keeps only allowlisted context', () => {
    const event = normalizeDiagnosticEvent(
      {
        level: 'warning',
        process: 'renderer',
        source: 'feature-dependencies',
        operation: 'prepare',
        code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
        message: 'Unable to prepare the dependency',
        correlationId: 'correlation-id',
        context: {
          dependencyId: 'python-ytdlp',
          retryable: true,
          durationMs: 123,
          inputCount: 3,
          successCount: 2,
          failureCount: 1,
          candidateCount: 5,
          trackTitle: 'private title',
          nested: { secret: 'drop me' },
        },
      },
      deterministicDefaults(),
    );

    expect(event).toEqual({
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      id: 'event-id',
      timestamp: '2026-08-22T00:00:00.000Z',
      level: 'warning',
      process: 'renderer',
      source: 'feature-dependencies',
      operation: 'prepare',
      code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
      message: 'Unable to prepare the dependency',
      sessionId: 'session-id',
      correlationId: 'correlation-id',
      context: {
        dependencyId: 'python-ytdlp',
        retryable: true,
        durationMs: 123,
        inputCount: 3,
        successCount: 2,
        failureCount: 1,
        candidateCount: 5,
      },
    });
  });

  it('redacts paths and URLs from errors without retaining nested causes', () => {
    const cause = new Error('token from https://example.com/?token=secret');
    const error = new Error(
      'Failed C:\\Users\\Alice\\Music\\private-song.mp3 via https://example.com/watch?v=secret',
      { cause },
    );
    error.stack =
      'Error: failed\n    at C:\\Users\\Alice\\Utawakui\\electron\\main.js:10:2';

    const event = normalizeDiagnosticEvent(
      {
        source: 'library',
        operation: 'list',
        code: 'FS_READ_FAILED',
        error,
      },
      deterministicDefaults(),
    );

    expect(event.message).toBe('Failed [path] via [url]');
    expect(event.context).toEqual({ errorName: 'Error' });
    expect(event.stack).toContain('[path]');
    expect(JSON.stringify(event)).not.toContain('Alice');
    expect(JSON.stringify(event)).not.toContain('secret');
    expect(JSON.stringify(event)).not.toContain('private-song');
  });

  it('redacts complete quoted paths that contain spaces', () => {
    const event = normalizeDiagnosticEvent(
      {
        source: 'library',
        operation: 'import',
        error: new Error(
          "ENOENT opening 'C:\\Users\\Alice\\My Music\\private song.mp3'",
        ),
      },
      deterministicDefaults(),
    );

    expect(event.message).toBe('ENOENT opening [path]');
    expect(event.message).not.toContain('My Music');
    expect(event.message).not.toContain('private song');
  });

  it.each([
    [
      'spawn C:\\Users\\John Doe\\Music\\My Song.mp3 ENOENT',
      'spawn [path] ENOENT',
    ],
    ['failed D:\\歌曲\\周杰倫 - 晴天.flac x', 'failed [path] x'],
    ['at load (C:\\Users\\John Doe\\app\\lib.js:10:5)', 'at load ([path])'],
    ['copy \\\\nas\\Shared Music\\a b.wav done', 'copy [path] done'],
  ])('redacts unquoted Windows paths with spaces: %s', (raw, expected) => {
    expect(redactText(raw)).toBe(expected);
  });

  it('keeps app-bundle stack frames readable while redacting user paths', () => {
    const appRoot =
      'C:\\Users\\Alice Smith\\AppData\\Local\\Programs\\Utawakui\\resources\\app.asar';
    const error = new Error('boom');
    error.stack = [
      'TypeError: boom',
      `    at onStatusChange (${appRoot}\\electron\\main.js:994:9)`,
      `    at load (file:///${appRoot.replaceAll('\\', '/')}/dist/assets/main.js:1:20)`,
      '    at read (C:\\Users\\Alice Smith\\Music\\song.mp3)',
    ].join('\n');

    const event = normalizeDiagnosticEvent(
      { source: 'runtime', operation: 'service', error },
      deterministicDefaults({ appRoot }),
    );

    expect(event.stack).toContain(
      'at onStatusChange (app:electron/main.js:994:9)',
    );
    expect(event.stack).toContain('at load (app:dist/assets/main.js:1:20)');
    expect(event.stack).toContain('at read ([path])');
    expect(event.stack).not.toContain('Alice');
  });

  it('relativizes percent-encoded renderer bundle URLs', () => {
    const appRoot =
      'C:\\Users\\Alice Smith\\AppData\\Local\\Programs\\Utawakui\\resources\\app.asar';
    const error = {
      stack: [
        'TypeError: boom',
        '    at render (file:///C:/Users/Alice%20Smith/AppData/Local/Programs/Utawakui/resources/app.asar/dist/assets/index-a1.js:3:40)',
      ].join('\n'),
    };

    const event = normalizeDiagnosticEvent(
      { process: 'renderer', source: 'vue', operation: 'x', error },
      deterministicDefaults({ appRoot }),
    );

    expect(event.stack).toContain(
      'at render (app:dist/assets/index-a1.js:3:40)',
    );
    expect(event.stack).not.toContain('Alice');
  });

  it('redacts bare credential assignments outside URLs', () => {
    expect(redactText('apikey=SECRET123 rejected')).toBe(
      'apikey=[redacted] rejected',
    );
    expect(redactText('Authorization: Bearer abc.def failed')).toBe(
      'Authorization=[redacted] failed',
    );
  });

  it('falls back safely for invalid identifiers, levels, and oversized text', () => {
    const event = normalizeDiagnosticEvent(
      {
        level: 'fatal',
        process: 'unknown-process',
        source: '../unsafe source',
        operation: '',
        code: 'bad code',
        message: 'x'.repeat(2000),
        context: { stage: 'y'.repeat(1000) },
      },
      deterministicDefaults(),
    );

    expect(event.level).toBe('error');
    expect(event.process).toBe('main');
    expect(event.source).toBe('app');
    expect(event.operation).toBe('unknown');
    expect(event.code).toBe('UNKNOWN_ERROR');
    expect(event.message.length).toBeLessThanOrEqual(500);
    expect(event.context.stage.length).toBeLessThanOrEqual(200);
  });

  it('adds authoritative runtime versions that renderer input cannot replace', () => {
    const event = normalizeDiagnosticEvent(
      {
        source: 'renderer',
        operation: 'save',
        context: {
          appVersion: 'forged-app',
          electronVersion: 'forged-electron',
        },
      },
      deterministicDefaults({
        appVersion: '0.1.1',
        electronVersion: '43.1.1',
      }),
    );

    expect(event.context).toMatchObject({
      appVersion: '0.1.1',
      electronVersion: '43.1.1',
    });
  });
});

describe('diagnostic JSONL', () => {
  it('serializes one deterministic JSON object per line', () => {
    const event = normalizeDiagnosticEvent(
      {
        source: 'output',
        operation: 'start',
        code: 'OUTPUT_START_FAILED',
        message: 'Port unavailable',
      },
      deterministicDefaults(),
    );

    const line = serializeDiagnosticEvent(event);

    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual(event);
  });

  it('skips malformed and partial lines while preserving valid events', () => {
    const valid = normalizeDiagnosticEvent(
      {
        source: 'output',
        operation: 'start',
        code: 'OUTPUT_START_FAILED',
        message: 'Port unavailable',
      },
      deterministicDefaults(),
    );
    const raw = `${serializeDiagnosticEvent(valid)}not-json\n{"partial":`;

    expect(parseDiagnosticJsonLines(raw)).toEqual([valid]);
  });

  it('re-sanitizes valid-looking persisted lines before returning them', () => {
    const valid = normalizeDiagnosticEvent(
      {
        source: 'library',
        operation: 'list',
        code: 'FS_READ_FAILED',
        message: 'safe',
      },
      deterministicDefaults(),
    );
    const handEdited = {
      ...valid,
      message: 'Failed C:\\Users\\Alice\\private.mp3',
      context: {
        dependencyId: 'python-ytdlp',
        trackTitle: 'private title',
      },
      stack: 'at C:\\Users\\Alice\\Utawakui\\main.js:1:1',
    };

    const [parsed] = parseDiagnosticJsonLines(
      `${JSON.stringify(handEdited)}\n`,
    );

    expect(parsed.message).toBe('Failed [path]');
    expect(parsed.context).toEqual({ dependencyId: 'python-ytdlp' });
    expect(parsed.stack).toBe('at [path]');
    expect(JSON.stringify(parsed)).not.toContain('Alice');
    expect(JSON.stringify(parsed)).not.toContain('private title');
  });
});

describe('createDiagnosticsService', () => {
  it('persists records and reads the newest events first', () => {
    const logsDir = makeTempDir();
    let nextId = 0;
    const service = createDiagnosticsService({
      logsDir,
      now: () => new Date('2026-08-22T00:00:00.000Z'),
      idGenerator: () => `event-${nextId++}`,
      sessionId: 'session-id',
      process: 'main',
    });

    expect(
      service.record({
        source: 'library',
        operation: 'list',
        code: 'FIRST',
        message: 'first',
      }).ok,
    ).toBe(true);
    service.record({
      source: 'library',
      operation: 'list',
      code: 'SECOND',
      message: 'second',
    });

    expect(service.listRecent(10).map((event) => event.code)).toEqual([
      'SECOND',
      'FIRST',
    ]);
  });

  it('notifies subscribers with stored redacted events and isolates failures', () => {
    const service = createDiagnosticsService({ logsDir: makeTempDir() });
    const seen = [];
    service.subscribe(() => {
      throw new Error('listener bug');
    });
    const unsubscribe = service.subscribe((event) => seen.push(event));

    const result = service.record({
      source: 'process',
      operation: 'uncaught-exception',
      code: 'UNCAUGHT_EXCEPTION',
      message: 'boom C:\\Users\\Alice Smith\\x.js',
    });
    unsubscribe();
    service.record({ source: 'process', operation: 'later', code: 'LATER' });

    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(result.event);
    expect(seen[0].message).toBe('boom [path]');
  });

  it('rotates before append and keeps only the configured generations', () => {
    const logsDir = makeTempDir();
    let nextId = 0;
    const service = createDiagnosticsService({
      logsDir,
      now: () => new Date('2026-08-22T00:00:00.000Z'),
      idGenerator: () => `event-${nextId++}`,
      sessionId: 'session-id',
      process: 'main',
      maxFileBytes: 420,
      maxRotations: 2,
    });

    for (let index = 0; index < 6; index += 1) {
      service.record({
        source: 'test',
        operation: 'rotate',
        code: `EVENT_${index}`,
        message: `event-${index}-${'x'.repeat(90)}`,
      });
    }

    expect(fs.existsSync(path.join(logsDir, 'diagnostics.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(logsDir, 'diagnostics.1.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(logsDir, 'diagnostics.2.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(logsDir, 'diagnostics.3.jsonl'))).toBe(
      false,
    );
    expect(service.listRecent(10).map((event) => event.code)).toEqual([
      'EVENT_5',
      'EVENT_4',
      'EVENT_3',
    ]);
  });

  it('fails open when the filesystem rejects a write', () => {
    const logsDir = makeTempDir();
    const service = createDiagnosticsService({
      logsDir,
      fs: {
        ...fs,
        appendFileSync() {
          const error = new Error('disk full');
          error.code = 'ENOSPC';
          throw error;
        },
      },
      ...deterministicDefaults(),
    });

    expect(() =>
      service.record({
        source: 'library',
        operation: 'save',
        code: 'FS_WRITE_FAILED',
        message: 'write failed',
      }),
    ).not.toThrow();
    expect(
      service.record({
        source: 'library',
        operation: 'save',
        code: 'FS_WRITE_FAILED',
        message: 'write failed',
      }),
    ).toMatchObject({ ok: false, errorCode: 'ENOSPC' });
  });

  it('fails open when a hostile event getter rejects normalization', () => {
    const logsDir = makeTempDir();
    const context = {};
    Object.defineProperty(context, 'stage', {
      enumerable: true,
      get() {
        throw new Error('hostile getter');
      },
    });
    const service = createDiagnosticsService({
      logsDir,
      ...deterministicDefaults(),
    });

    expect(() => service.record({ source: 'renderer', context })).not.toThrow();
    expect(service.record({ source: 'renderer', context })).toEqual({
      ok: false,
      errorCode: 'DIAGNOSTICS_NORMALIZE_FAILED',
    });
  });

  it('clears only managed diagnostic files', () => {
    const logsDir = makeTempDir();
    const unrelatedPath = path.join(logsDir, 'keep.txt');
    fs.writeFileSync(unrelatedPath, 'keep');
    const service = createDiagnosticsService({
      logsDir,
      maxFileBytes: 1,
      maxRotations: 2,
      ...deterministicDefaults(),
    });
    service.record({ source: 'test', message: 'one' });
    service.record({ source: 'test', message: 'two' });

    const result = service.clear();

    expect(result.ok).toBe(true);
    expect(result.removed).toBeGreaterThan(0);
    expect(fs.existsSync(unrelatedPath)).toBe(true);
    expect(
      fs.readdirSync(logsDir).filter((name) => name.endsWith('.jsonl')),
    ).toEqual([]);
  });

  it('rejects a managed filename that could escape the logs directory', () => {
    expect(() =>
      createDiagnosticsService({
        logsDir: makeTempDir(),
        fileName: '..\\outside.jsonl',
      }),
    ).toThrow(TypeError);
  });
});
