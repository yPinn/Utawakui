'use strict';

const fs = require('node:fs');
const { constants, createDecipheriv, privateDecrypt } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

function openSupportPackage(input, privateKey) {
  const pkg = input?.diagnostics ?? input;
  if (pkg !== input && pkg.reference !== input.reportId) {
    throw new Error('Support data does not match the feedback reference');
  }
  if (pkg?.format !== 'utawakui-support-v1' || !pkg.sealed) {
    throw new Error('No encrypted support data');
  }
  const { key, iv, tag, data } = pkg.sealed;
  const sessionKey = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(key, 'base64'),
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    sessionKey,
    Buffer.from(iv, 'base64'),
    {
      authTagLength: 16,
    },
  );
  decipher.setAAD(Buffer.from(pkg.reference, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const compressed = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]);
  const details = JSON.parse(
    gunzipSync(compressed, { maxOutputLength: 5 * 1024 * 1024 }),
  );
  return {
    reference: pkg.reference,
    ...details,
    events: details.events.map((event) => ({
      ...event,
      message: event.code,
      stack: event.appFrames.join('\n'),
    })),
  };
}

if (require.main === module) {
  const [, , input, keyFile] = process.argv;
  try {
    if (!input || !keyFile) throw new Error();
    if (fs.statSync(input).size > 5 * 1024 * 1024) throw new Error();
    const pkg = JSON.parse(fs.readFileSync(input, 'utf8'));
    const privateKey = fs.readFileSync(keyFile, 'utf8');
    process.stdout.write(
      JSON.stringify(openSupportPackage(pkg, privateKey), null, 2) + '\n',
    );
  } catch {
    process.stderr.write(
      'Could not open support package. Usage: node scripts/open-support-package.cjs <package> <private-key.pem>\n',
    );
    process.exitCode = 1;
  }
}

module.exports = { openSupportPackage };
