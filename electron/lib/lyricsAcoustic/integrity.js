'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function contained(root, value) {
  const relative = path.relative(root, value);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('lyrics environment path rejected');
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error('lyrics environment link rejected');
  }
  return value;
}
async function fileHash(file, signal) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) {
    signal?.throwIfAborted();
    digest.update(chunk);
  }
  return digest.digest('hex');
}
function treeFiles(root) {
  const files = [];
  function walk(dir, depth) {
    if (depth > 32 || files.length > 10000)
      throw new Error('lyrics environment file budget');
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = contained(root, path.join(dir, entry.name));
      if (entry.name === '__pycache__') continue;
      if (entry.name.endsWith('.pyc'))
        throw new Error('lyrics environment bytecode rejected');
      if (entry.isDirectory()) walk(file, depth + 1);
      else if (entry.isFile()) files.push(file);
      else throw new Error('lyrics environment file type rejected');
    }
  }
  if (fs.lstatSync(root).isSymbolicLink())
    throw new Error('lyrics environment link rejected');
  walk(root, 0);
  return files;
}
async function fingerprintTree(root, signal) {
  const rows = [];
  for (const file of treeFiles(root))
    rows.push([
      path.relative(root, file).split(path.sep).join('/'),
      await fileHash(file, signal),
    ]);
  return sha(JSON.stringify(rows));
}
async function verifyFileTable(root, entries, signal) {
  if (fs.lstatSync(root).isSymbolicLink())
    throw new Error('lyrics environment link rejected');
  for (const [name, pin] of Object.entries(entries)) {
    signal?.throwIfAborted();
    const file = contained(root, path.resolve(root, name));
    const stat = fs.lstatSync(file);
    const bytes = pin.normalizeLf
      ? Buffer.from(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))
      : null;
    if (
      !stat.isFile() ||
      (bytes?.length ?? stat.size) !== pin.bytes ||
      (bytes ? sha(bytes) : await fileHash(file, signal)) !== pin.sha256
    )
      throw new Error('lyrics environment integrity failed');
  }
}
module.exports = {
  sha,
  contained,
  fileHash,
  treeFiles,
  fingerprintTree,
  verifyFileTable,
};
