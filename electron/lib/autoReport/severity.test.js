import { describe, expect, it } from 'vitest';
import severityModule from './severity.js';

const { appFramesOf, classifyDiagnosticEvent, fingerprintOf } = severityModule;

describe('auto report severity', () => {
  const main = (code, level = 'error') => ({ level, process: 'main', code });
  const renderer = (code) => ({ level: 'error', process: 'renderer', code });

  it('classifies listed codes and fails closed for everything else', () => {
    expect(classifyDiagnosticEvent(main('UNCAUGHT_EXCEPTION'))).toBe('S1');
    expect(classifyDiagnosticEvent(main('UNHANDLED_REJECTION'))).toBe('S2');
    expect(classifyDiagnosticEvent(main('DOWNLOAD_FAILED'))).toBe('S3');
    expect(classifyDiagnosticEvent(main('UNCAUGHT_EXCEPTION', 'info'))).toBe(
      'S4',
    );
  });

  it('counts each code only from the process that owns it', () => {
    expect(classifyDiagnosticEvent(renderer('UNCAUGHT_EXCEPTION'))).toBe('S3');
    expect(classifyDiagnosticEvent(renderer('PRELOAD_FAILED'))).toBe('S3');
    expect(classifyDiagnosticEvent(main('VUE_UNHANDLED_ERROR'))).toBe('S3');
    expect(classifyDiagnosticEvent(renderer('VUE_UNHANDLED_ERROR'))).toBe('S2');
    expect(classifyDiagnosticEvent(renderer('UNHANDLED_REJECTION'))).toBe('S2');
  });

  it('escalates child exits only when lifecycle graded them as errors', () => {
    expect(classifyDiagnosticEvent(main('CHILD_PROCESS_GONE'))).toBe('S2');
    expect(classifyDiagnosticEvent(main('CHILD_PROCESS_GONE', 'warning'))).toBe(
      'S3',
    );
  });

  it('treats renderer exits as S1 only for fatal reasons', () => {
    const exit = (fatal) => ({
      level: 'error',
      process: 'main',
      code: 'RENDER_PROCESS_GONE',
      context: { fatal },
    });
    expect(classifyDiagnosticEvent(exit(true))).toBe('S1');
    expect(classifyDiagnosticEvent(exit(false))).toBe('S3');
  });

  it('keeps only app frames and fingerprints without line numbers', () => {
    const stack = [
      'TypeError: boom',
      '    at onStatusChange (app:electron/main.js:994:9)',
      '    at node:internal/process (node:events:1:1)',
      '    at read ([path])',
      '    at app:dist/assets/main.js:1:20',
    ].join('\n');

    expect(appFramesOf(stack)).toEqual([
      'at onStatusChange (app:electron/main.js:994:9)',
      'at app:dist/assets/main.js:1:20',
    ]);
    const moved = stack.replace(':994:9', ':1002:3');
    expect(fingerprintOf({ code: 'X', stack: moved })).toBe(
      fingerprintOf({ code: 'X', stack }),
    );
    expect(fingerprintOf({ code: 'X', stack })).toBe(
      'X|at onStatusChange (app:electron/main.js',
    );
  });

  it('separates stackless lifecycle failures by window role', () => {
    const unresponsive = (windowRole) => ({
      code: 'RENDERER_UNRESPONSIVE',
      context: windowRole ? { windowRole } : {},
    });
    expect(fingerprintOf(unresponsive('main'))).toBe(
      'RENDERER_UNRESPONSIVE@main|',
    );
    expect(fingerprintOf(unresponsive('performer'))).not.toBe(
      fingerprintOf(unresponsive('main')),
    );
    expect(fingerprintOf(unresponsive())).toBe('RENDERER_UNRESPONSIVE|');
  });
});
