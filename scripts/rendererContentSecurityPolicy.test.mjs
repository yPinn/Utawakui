import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const devServer = JSON.parse(
  readFileSync(new URL('../shared/devServerValues.json', import.meta.url)),
);

it('allows only the named account image CDNs in the control panel', () => {
  const panel = directives('index.html');
  const prompter = directives('src/entries/prompter/index.html');
  for (const origin of [
    'https://yt3.googleusercontent.com',
    'https://yt3.ggpht.com',
    'https://i.scdn.co',
  ]) {
    expect(panel.get('img-src')).toContain(origin);
    expect(panel.get('connect-src')).not.toContain(origin);
  }
  expect(prompter.get('img-src')).not.toContain('https://i.scdn.co');
});

function directives(file) {
  const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const policy = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  )[1];
  return new Map(
    policy.split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

// Packaged renderers load from file://, where 'self' spans the whole disk.
describe.each(['index.html', 'src/entries/prompter/index.html'])(
  '%s Content-Security-Policy',
  (file) => {
    it('keeps fetch and framing off the file: scheme', () => {
      const policy = directives(file);
      expect(policy.get('connect-src')).toEqual([
        `http://${devServer.host}:${devServer.port}`,
        `ws://${devServer.host}:${devServer.port}`,
      ]);
      expect(policy.get('frame-src')).not.toContain("'self'");
    });
  },
);
