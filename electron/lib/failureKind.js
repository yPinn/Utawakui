'use strict';

const failureKindValues = require('../../shared/failureKindValues.json');

const FAILURE_KINDS = Object.freeze([...failureKindValues.kinds]);
const MAX_CAUSE_DEPTH = 5;

const KIND_BY_CODE = new Map([
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
]);

// Maps an error code, or one on its `cause` chain, to a user-facing category.
function classifyFailureKind(error) {
  const seen = new Set();
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!current || typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    const kind = KIND_BY_CODE.get(current.code);
    if (kind) return kind;
    current = current.cause;
  }
}

module.exports = { FAILURE_KINDS, classifyFailureKind };
