import { describe, expect, it } from 'vitest';
import values from '../../shared/downloadFailureValues.json';
import {
  DOWNLOAD_FAILURE_CODES,
  DOWNLOAD_FAILURE_PREFIX,
} from './downloadFailure.js';

describe('download failure transport values', () => {
  it('drives the main transport prefix and unique closed code set', () => {
    expect(values.schemaVersion).toBe(1);
    expect(DOWNLOAD_FAILURE_PREFIX).toBe(values.prefix);
    expect(DOWNLOAD_FAILURE_CODES).toEqual(values.codes);
    expect(new Set(values.codes).size).toBe(values.codes.length);
  });
});
