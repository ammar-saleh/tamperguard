// Local-only demo server. Exported for traversal and HTTP behavior tests.
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, relative, isAbsolute } from 'node:path';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
function inside(root, file) {
  const rel = relative(root, file);
  return rel !== '..' && !rel.startsWith('..\\') && !rel.startsWith('../') && !isAbsolute(rel);
}
export function createDemoServer(root = defaultRoot) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) {
        res.writeHead(403).end('Forbidden'); return;
      }
      // Redirect so relative links and styles in the demo index resolve under /demos/.
      if (path === '/') { res.writeHead(302, { Location: '/demos/' }).end(); return; }
      if (path.endsWith('/')) path += 'index.html';
      if (!/^\/(demos|dist|test)\//.test(path) || !types[extname(path)]) { res.writeHead(404).end('Not found'); return; }
      const base = await realpath(root);
      const file = await realpath(resolve(base, '.' + path));
      if (!inside(base, file)) { res.writeHead(403).end('Forbidden'); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)], 'Content-Length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const server = createDemoServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Demos: http://127.0.0.1:${port}/demos/`));
}
