import { describe, expect, it } from 'vitest';
import { isOutputPortConflict } from './outputRuntimeError.js';

describe('isOutputPortConflict', () => {
  it.each([
    'Port is already in use: 8700',
    'listen EADDRINUSE: address already in use 127.0.0.1:8700',
    new Error('EADDRINUSE'),
  ])('recognizes a port collision from %s', (value) => {
    expect(isOutputPortConflict(value)).toBe(true);
  });

  it.each(['', null, 'Permission denied', new Error('Service unavailable')])(
    'rejects unrelated errors from %s',
    (value) => {
      expect(isOutputPortConflict(value)).toBe(false);
    },
  );
});
