'use strict';

const { digest } = require('../reconciliation/documents');
const {
  managedPath,
  backupPath,
  fileHash,
  readTagAudio,
} = require('./transaction');
const { inspectFlac } = require('./flac');
function audioIdentity(bytes) {
  const parsed = inspectFlac(bytes);
  return digest(Buffer.concat([parsed.blocks[0].data, parsed.audio]));
}
// Original-file dedup aliases are admitted only with the current file AND
// each exact original backup verified. A stale index or receipt alone is not
// evidence that today's managed media is the same audio.
async function tagContentAliases(dir, trackId, indexedHash, acceptedReceipts) {
  try {
    const { readTagLedger } = require('./ledger');
    const receipts = (
      acceptedReceipts ?? readTagLedger(dir).data.receipts
    ).filter((r) => r.trackId === trackId);
    if (!receipts.length) return [];
    const file = managedPath(dir, trackId);
    if (
      fileHash(file) !== indexedHash ||
      receipts.at(-1).afterHash !== indexedHash
    )
      return [];
    const current = await readTagAudio(file);
    if (digest(current) !== indexedHash) return [];
    const essence = audioIdentity(current),
      hashes = new Set([indexedHash]);
    for (const receipt of receipts.toReversed()) {
      if (!hashes.has(receipt.afterHash) || receipt.essence !== essence)
        continue;
      const backup = backupPath(dir, receipt.backupId, 'original.flac');
      if (fileHash(backup) !== receipt.beforeHash) continue;
      const original = await readTagAudio(backup);
      if (
        digest(original) === receipt.beforeHash &&
        audioIdentity(original) === essence
      )
        hashes.add(receipt.beforeHash);
    }
    if (fileHash(file) !== indexedHash) return [];
    return [...hashes].filter((hash) => hash !== indexedHash);
  } catch {
    return [];
  }
}
module.exports = { tagContentAliases };
