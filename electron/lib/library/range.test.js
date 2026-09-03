import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildRangeResponse } from './range.js';

describe('buildRangeResponse', () => {
  let dir;
  let filePath;
  let content;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-range-test-'));
    filePath = path.join(dir, 'sample.mp3');
    content = Buffer.from(Array.from({ length: 2000 }, (_, i) => i % 256));
    fs.writeFileSync(filePath, content);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('serves the full file with status 200 when there is no Range header', async () => {
    const res = buildRangeResponse(filePath, null);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-length')).toBe(String(content.length));
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content)).toBe(0);
  });

  it('serves a 206 partial response for a Range header', async () => {
    const res = buildRangeResponse(filePath, 'bytes=100-199');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 100-199/${content.length}`,
    );
    expect(res.headers.get('content-length')).toBe('100');
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content.subarray(100, 200))).toBe(0);
  });

  it('serves to end of file for an open-ended Range', async () => {
    const res = buildRangeResponse(filePath, 'bytes=1900-');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 1900-1999/${content.length}`,
    );
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content.subarray(1900, 2000))).toBe(0);
  });

  it('serves the actual file tail for a suffix Range', async () => {
    const res = buildRangeResponse(filePath, 'bytes=-128');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(
      `bytes 1872-1999/${content.length}`,
    );
    expect(res.headers.get('content-length')).toBe('128');
    const body = Buffer.from(await res.arrayBuffer());
    expect(Buffer.compare(body, content.subarray(1872, 2000))).toBe(0);
  });

  it('clamps a range end beyond the file size', () => {
    const res = buildRangeResponse(filePath, 'bytes=1990-5000');
    expect(res.headers.get('content-range')).toBe(
      `bytes 1990-1999/${content.length}`,
    );
  });

  it('falls back to a full 200 response for a malformed Range header', () => {
    expect(buildRangeResponse(filePath, 'not-a-range').status).toBe(200);
  });

  it('returns 416 for a start offset entirely past EOF', () => {
    const res = buildRangeResponse(filePath, 'bytes=5000-6000');
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe(`bytes */${content.length}`);
  });

  it('returns 416 for an inverted range (start > end)', () => {
    const res = buildRangeResponse(filePath, 'bytes=200-100');
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe(`bytes */${content.length}`);
  });

  it('serves an empty 200 response for a zero-byte file with no Range header', async () => {
    fs.writeFileSync(filePath, Buffer.alloc(0));
    const res = buildRangeResponse(filePath, null);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('0');
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBe(0);
  });

  it('returns 416 for a Range header against a zero-byte file', () => {
    fs.writeFileSync(filePath, Buffer.alloc(0));
    const res = buildRangeResponse(filePath, 'bytes=0-10');
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */0');
  });
});
