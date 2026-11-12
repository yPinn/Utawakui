import { describe, expect, it } from 'vitest';
import enCommon from '../../shared/locales/en-US/common.json';
import zhCommon from '../../shared/locales/zh-TW/common.json';
import values from '../../shared/failureKindValues.json';
import { FAILURE_KINDS, classifyFailureKind } from './failureKind.js';

function errorWithCode(code, message = 'failed') {
  return Object.assign(new Error(message), { code });
}

describe('failure kind values', () => {
  it('drives one unique closed kind set', () => {
    expect(values.schemaVersion).toBe(1);
    expect(FAILURE_KINDS).toEqual(values.kinds);
    expect(new Set(values.kinds).size).toBe(values.kinds.length);
  });

  it('has guidance copy for every kind in each locale', () => {
    const keys = values.kinds.map((kind) =>
      kind.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
    );
    for (const common of [zhCommon, enCommon]) {
      expect(Object.keys(common.appError.failureKind).sort()).toEqual(
        [...keys].sort(),
      );
    }
  });
});

describe('classifyFailureKind', () => {
  it.each([
    ['ENOSPC', 'disk-full'],
    ['EDQUOT', 'disk-full'],
    ['EACCES', 'access-denied'],
    ['EPERM', 'access-denied'],
    ['EROFS', 'access-denied'],
    ['EBUSY', 'file-in-use'],
    ['ENOENT', 'file-missing'],
    ['ENOTDIR', 'file-missing'],
    ['ENOTFOUND', 'network'],
    ['EAI_AGAIN', 'network'],
    ['ECONNREFUSED', 'network'],
    ['ECONNRESET', 'network'],
    ['ETIMEDOUT', 'network'],
    ['ENETUNREACH', 'network'],
    ['UND_ERR_CONNECT_TIMEOUT', 'network'],
    ['FEATURE_DEPENDENCY_MISSING', 'dependency-missing'],
  ])('maps %s to %s', (code, kind) => {
    expect(classifyFailureKind(errorWithCode(code))).toBe(kind);
  });

  it('finds the kind on a wrapped cause, such as a failed fetch', () => {
    const fetchError = new TypeError('fetch failed', {
      cause: errorWithCode('ENOTFOUND'),
    });
    expect(classifyFailureKind(new Error('outer', { cause: fetchError }))).toBe(
      'network',
    );
  });

  it('leaves unknown, missing and non-error values unclassified', () => {
    expect(classifyFailureKind(errorWithCode('WORKS_STALE'))).toBeUndefined();
    expect(
      classifyFailureKind(new Error('ENOSPC in text only')),
    ).toBeUndefined();
    expect(classifyFailureKind(null)).toBeUndefined();
    expect(classifyFailureKind('ENOSPC')).toBeUndefined();
  });

  it('stops on a cyclic cause chain', () => {
    const first = new Error('first');
    const second = new Error('second', { cause: first });
    first.cause = second;
    expect(classifyFailureKind(first)).toBeUndefined();
  });
});
