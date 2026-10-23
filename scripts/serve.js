const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wav': 'audio/wav' };
function createServer() { return http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch (error) { response.writeHead(400).end(); return; }
  if (pathname === '/') pathname = '/preview/minigame.html';
  if (pathname.includes('\\') || (!pathname.startsWith('/preview/') && !pathname.startsWith('/miniprogram/core/') && !pathname.startsWith('/miniprogram/assets/audio/') && !pathname.startsWith('/minigame/src/'))) {
    response.writeHead(404).end('Not found'); return;
  }
  const file = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !contentTypes[path.extname(file)]) {
    response.writeHead(404).end('Not found'); return;
  }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Unable to read file'); return; }
    const headers = { 'Content-Type': contentTypes[path.extname(file)], 'Content-Length': data.length, 'Cache-Control': 'no-store' };
    // Media clients need a known length and byte ranges for loop/seek playback.
    if (path.extname(file) === '.wav') {
      headers['Accept-Ranges'] = 'bytes';
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        let start = 0, end = data.length - 1;
        if (range && (range[1] || range[2])) {
          start = range[1] ? Number(range[1]) : Math.max(0, data.length - Number(range[2]));
          end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
        } else start = data.length;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length) {
          response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }).end(); return;
        }
        response.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${data.length}` });
        response.end(data.subarray(start, end + 1)); return;
      }
    }
    response.writeHead(200, headers); response.end(data);
  });
}); }
if (require.main === module) {
  const server = createServer();
  server.on('error', error => { console.error(`预览启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`探索新道路试玩：http://127.0.0.1:${server.address().port}`));
}
module.exports = { createServer };
