import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const uiDirectory = fileURLToPath(new URL('.', import.meta.url));

function vueSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return vueSources(path);
    return entry.name.endsWith('.vue')
      ? [[path, readFileSync(path, 'utf8')]]
      : [];
  });
}

describe('overlay primitive teleports', () => {
  // A feature mounts in the same pass as its surface host, before that host is
  // in the document; an eager Teleport then keeps a null target and crashes
  // Vue's patch on first open (Setlist's track context menu did).
  it('defer target resolution or mount only while open', () => {
    const offenders = [];
    for (const [path, source] of vueSources(uiDirectory)) {
      for (const [tag] of source.matchAll(/<Teleport\b[^>]*>/gu)) {
        if (!/\bdefer\b|\bv-if=/u.test(tag)) offenders.push(`${path}: ${tag}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
