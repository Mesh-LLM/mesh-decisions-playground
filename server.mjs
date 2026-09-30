import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const assets = new Map([
  ['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']],
  ['/contract.js', ['contract.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']],
]);
const LIMIT = 128 * 1024;
function fail(status, message) { return Object.assign(new Error(message), { status }); }
async function bounded(stream, limit = LIMIT) {
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.length;
    if (length > limit) throw fail(413, 'Payload too large.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
export function createApp({ upstream = 'http://127.0.0.1:9337', timeout = 30_000 } = {}) {
  const target = new URL(upstream);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password
    || target.pathname !== '/' || target.search || target.hash) {
    throw new Error('MESH_URL must be an HTTP(S) origin, without credentials, path, or query.');
  }
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const port = req.socket.localPort;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) throw fail(403, 'Untrusted Host.');
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw fail(403, 'Cross-origin requests are blocked.');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, 'Cross-site requests are blocked.');
      const asset = assets.get(req.url);
      if (asset && req.method === 'GET') {
        const body = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
        return res.end(body);
      }
      let path;
      let body;
      if (req.url === '/api/models' && req.method === 'GET') path = '/v1/models';
      else if (req.url === '/api/decision' && req.method === 'POST') {
        if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw fail(415, 'Use application/json.');
        if (Number(req.headers['content-length']) > LIMIT) throw fail(413, 'Payload too large.');
        body = await bounded(req);
        try { JSON.parse(body); } catch { throw fail(400, 'Invalid JSON.'); }
        path = '/systemone';
      } else throw fail(404, 'Not found.');
      let response;
      let data;
      try {
        response = await fetch(new URL(path, target), {
          method: req.method, body, headers: { 'Content-Type': 'application/json' },
          redirect: 'error', signal: AbortSignal.timeout(timeout),
        });
        data = JSON.parse(await bounded(response.body, 1024 * 1024));
      } catch {
        throw fail(502, 'Mesh is unavailable, timed out, or returned invalid data. Check MESH_URL and that the model is ready.');
      }
      if (!response.ok) {
        const hint = response.status === 404 ? ' This endpoint/model may not support remote decisions; connect directly to the serving node.' : '';
        throw fail(response.status, `Mesh returned HTTP ${response.status}.${hint}`);
      }
      json(res, 200, data);
    } catch (error) {
      if (!res.destroyed) json(res, error.status || 500, { error: error.status ? error.message : 'Internal server error.' });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const server = createApp({ upstream: process.env.MESH_URL });
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Decisions playground: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
