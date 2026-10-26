'use strict';

// Opt-in integration suite for the independent evaluation dependency tree.
// First npm ci --ignore-scripts --prefix scripts/lyrics-provider-netease-runtime,
// then node --test scripts/lyrics-provider-netease-runtime/dependency-security.test.cjs.
// Never imports the provider entry point or contacts a real provider.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const net = require('node:net');
const http = require('node:http');
const { test } = require('node:test');
const redirects = require('follow-redirects');
const { getUri } = require('get-uri');
const proxyaddr = require('proxy-addr');
const qs = require('qs');
const { Address4, Address6 } = require('ip-address');

test('query parsing and serialization preserve bounded nested form values', () => {
  const value = { names: ['one', 'two'], filter: { enabled: 'yes' } };
  assert.deepEqual(qs.parse(qs.stringify(value)), value);
  assert.deepEqual(qs.parse('__proto__[polluted]=yes'), {});
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('IP subnet comparisons reject mixed families and recognize link-local IPv6', () => {
  assert.equal(
    new Address6('a00::1').isInSubnet(new Address4('10.0.0.0/8')),
    false,
  );
  assert.equal(
    new Address4('32.0.0.1').isInSubnet(new Address6('2000::/3')),
    false,
  );
  assert.equal(
    new Address4('10.1.2.3').isInSubnet(new Address4('10.0.0.0/8')),
    true,
  );
  assert.equal(new Address6('febf::1').isLinkLocal(), true);
});

test('the pinned metadata 11 client still parses local PCM audio without network', async () => {
  const { parseBuffer } = await import('music-metadata');
  const audio = Buffer.alloc(60);
  audio.write('RIFF', 0);
  audio.writeUInt32LE(52, 4);
  audio.write('WAVEfmt ', 8);
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(8000, 24);
  audio.writeUInt32LE(16000, 28);
  audio.writeUInt16LE(2, 32);
  audio.writeUInt16LE(16, 34);
  audio.write('data', 36);
  audio.writeUInt32LE(16, 40);
  const result = await parseBuffer(audio, { mimeType: 'audio/wav' });
  assert.equal(result.format.sampleRate, 8000);
  assert.equal(result.format.numberOfChannels, 1);
  assert.equal(result.format.bitsPerSample, 16);
});

test('proxy trust rejects the malformed mapped subnet without breaking IPv4', () => {
  assert.equal(proxyaddr.compile('::ffff:10.0.0.0/8')('203.0.113.10'), false);
  assert.equal(proxyaddr.compile('10.0.0.0/8')('10.1.2.3'), true);
});

for (const headerShape of ['object', 'array']) {
  test(
    `cross-origin redirects strip credential headers supplied as ${headerShape}`,
    { timeout: 5000 },
    async (context) => {
      const originalRequests = [];
      const target = http.createServer((request, response) => {
        response.end(JSON.stringify(request.headers));
      });
      const source = http.createServer((request, response) => {
        originalRequests.push(request.headers);
        response.writeHead(302, {
          Location: `http://127.0.0.1:${target.address().port}/target`,
        });
        response.end();
      });
      context.after(async () => {
        await Promise.all(
          [source, target].map(
            (server) =>
              new Promise((resolve) => {
                server.closeAllConnections();
                server.close(resolve);
              }),
          ),
        );
      });
      for (const server of [target, source]) {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
      }
      const headers = {
        Authorization: 'Bearer synthetic-test',
        Cookie: 'session=synthetic-test',
        'Proxy-Authorization': 'Basic synthetic-test',
        'X-Api^Key': 'synthetic-test',
        'X-Token|Secret': 'synthetic-test',
        'X-Public': 'retained',
      };
      const received = await new Promise((resolve, reject) => {
        const request = redirects.http.get(
          `http://127.0.0.1:${source.address().port}/start`,
          {
            headers:
              headerShape === 'array'
                ? Object.entries(headers).flat()
                : headers,
            sensitiveHeaders: ['X-Api^Key', 'X-Token|Secret'],
          },
          (response) => {
            let body = '';
            response.on('error', reject);
            response.on('data', (chunk) => (body += chunk));
            response.on('end', () => resolve(JSON.parse(body)));
          },
        );
        request.on('error', reject);
        request.setTimeout(2000, () => request.destroy(new Error('timeout')));
      });
      assert.equal(originalRequests.length, 1);
      for (const name of Object.keys(headers).filter(
        (name) => name !== 'X-Public',
      )) {
        assert.ok(originalRequests[0][name.toLowerCase()]);
        assert.equal(received[name.toLowerCase()], undefined);
      }
      assert.equal(received['x-public'], 'retained');
    },
  );
}

test('FTP parser rejects the long malformed line within a process deadline', () => {
  // Resolve the actual client used by get-uri, even if npm nests it in future.
  const getUriRequire = createRequire(require.resolve('get-uri'));
  const parserPath = getUriRequire.resolve('basic-ftp/dist/parseList');
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `
        const assert = require('node:assert/strict');
        const { parseList } = require(${JSON.stringify(parserPath)});
        const bad = '-rw-r--r-- 1 ' + 'a '.repeat(65536) + '!';
        const valid = '-rw-r--r-- 1 owner group 42 Jan 1 2026 file.txt';
        const files = parseList(bad + '\\r\\n' + valid + '\\r\\n');
        assert.deepEqual(files.map(file => [file.name, file.size]), [['file.txt', 42]]);
      `,
    ],
    { timeout: 3000, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

async function checkTransfer(fallback) {
  const content = 'function FindProxyForURL() { return "DIRECT"; }';
  const commands = [];
  const servers = new Set();
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    let buffer = '';
    let dataSocket;
    let transferContent;
    const transfer = () => {
      if (!dataSocket || transferContent === undefined) return;
      dataSocket.end(transferContent, () =>
        socket.write('226 Transfer complete\r\n'),
      );
      transferContent = undefined;
    };
    socket.write('220 Test FTP ready\r\n');
    socket.on('data', (data) => {
      buffer += data.toString();
      let index;
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const command = line.split(' ')[0];
        commands.push(command);
        if (command === 'USER') socket.write('331 Password required\r\n');
        else if (command === 'PASS') socket.write('230 Logged in\r\n');
        else if (command === 'FEAT') socket.write('211 No features\r\n');
        else if (command === 'MDTM') {
          socket.write(fallback ? '500 No MDTM\r\n' : '213 20260101000000\r\n');
        } else if (command === 'EPSV') {
          dataSocket = undefined;
          const dataServer = net.createServer((connection) => {
            dataSocket = connection;
            sockets.add(connection);
            connection.on('error', () => {});
            transfer();
          });
          servers.add(dataServer);
          dataServer.listen(0, '127.0.0.1', () => {
            socket.write(
              `229 Entering Extended Passive Mode (|||${dataServer.address().port}|)\r\n`,
            );
          });
        } else if (command === 'LIST' || command === 'MLSD') {
          socket.write('150 Listing\r\n');
          transferContent = `type=file;size=${content.length};modify=20260101000000; file.pac\r\n`;
          transfer();
        } else if (command === 'RETR') {
          socket.write('150 Download\r\n');
          transferContent = content;
          transfer();
        } else if (command === 'QUIT') socket.end('221 Goodbye\r\n');
        else socket.write('200 OK\r\n');
      }
    });
  });
  servers.add(server);
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const stream = await getUri(
      `ftp://127.0.0.1:${server.address().port}/file.pac`,
      { timeout: 2000 },
    );
    let result = '';
    for await (const chunk of stream) result += chunk.toString();
    assert.equal(result, content);
    assert.equal(stream.lastModified.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.ok(commands.includes('RETR'));
    if (fallback) {
      assert.ok(commands.includes('LIST') || commands.includes('MLSD'));
    }
  } finally {
    for (const socket of sockets) socket.destroy();
    for (const item of servers) {
      await new Promise((resolve) => item.close(resolve));
    }
  }
}

test(
  'get-uri transfers bytes and MDTM using the patched FTP client',
  { timeout: 10000 },
  async () => {
    await checkTransfer(false);
  },
);

test(
  'get-uri preserves its listing fallback with the patched FTP client',
  { timeout: 10000 },
  async () => {
    await checkTransfer(true);
  },
);
