const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../scripts/serve');

test('music responses advertise duration-related length and support exact, open and suffix byte ranges', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const file = fs.readFileSync(path.resolve(__dirname, '../miniprogram/assets/audio/ambient.wav'));
  const url = `${base}/miniprogram/assets/audio/ambient.wav`;
  const full = await fetch(url);
  assert.equal(full.status, 200); assert.equal(full.headers.get('content-type'), 'audio/wav');
  assert.equal(Number(full.headers.get('content-length')), file.length);
  assert.equal(full.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), file);
  for (const [range, start, end] of [['bytes=0-43', 0, 43], [`bytes=${file.length - 50}-`, file.length - 50, file.length - 1], ['bytes=-20', file.length - 20, file.length - 1]]) {
    const response = await fetch(url, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${file.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), file.subarray(start, end + 1));
  }
  for (const range of ['bytes=99999999-', 'bytes=40-20', 'bytes=-0', 'bytes=-', 'bytes=0-1,5-7']) {
    const response = await fetch(url, { headers: { Range: range } });
    assert.equal(response.status, 416); assert.equal(response.headers.get('content-range'), `bytes */${file.length}`);
    await response.arrayBuffer();
  }
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/project.config.json`)).status, 404);
});
