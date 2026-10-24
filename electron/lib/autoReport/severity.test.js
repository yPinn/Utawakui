import { describe, expect, it } from 'vitest';
import severityModule from './severity.js';

const { appFramesOf, classifyDiagnosticEvent, fingerprintOf } = severityModule;

describe('auto report severity', () => {
  it('classifies listed codes and fails closed for everything else', () => {
    expect(
      classifyDiagnosticEvent({ level: 'error', code: 'UNCAUGHT_EXCEPTION' }),
    ).toBe('S1');
    expect(
      classifyDiagnosticEvent({ level: 'error', code: 'UNHANDLED_REJECTION' }),
    ).toBe('S2');
    expect(
      classifyDiagnosticEvent({ level: 'error', code: 'DOWNLOAD_FAILED' }),
    ).toBe('S3');
    expect(
      classifyDiagnosticEvent({ level: 'info', code: 'UNCAUGHT_EXCEPTION' }),
    ).toBe('S4');
  });

  it('treats renderer exits as S1 only for fatal reasons', () => {
    const exit = (fatal) => ({
      level: 'error',
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
});
