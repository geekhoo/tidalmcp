import test from 'node:test';
import assert from 'node:assert/strict';
import { webExchange } from '../../src/core/web-adapter.mjs';

test('web exchange exposes the Node-style request surface to handlers', async () => {
  const request = new Request('https://music.example.com/token?x=1', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-custom': 'v' },
    body: 'grant_type=refresh_token',
  });
  const exchange = webExchange(request, { ip: '203.0.113.9' });
  assert.equal(exchange.req.method, 'POST');
  assert.equal(exchange.req.url, '/token?x=1');
  assert.equal(exchange.req.headers['x-custom'], 'v');
  assert.equal(exchange.req.socket.remoteAddress, '203.0.113.9');
  const chunks = [];
  for await (const chunk of exchange.req) chunks.push(chunk.toString('utf8'));
  assert.equal(chunks.join(''), 'grant_type=refresh_token');
});

test('web exchange collects status, headers, cookies and body into a Response', () => {
  const exchange = webExchange(new Request('https://music.example.com/authorize'));
  exchange.res.setHeader('X-Request-Id', 'abc');
  exchange.res.writeHead(302, { Location: 'https://tidal.com/consent', 'Set-Cookie': 'flow=1; Path=/; HttpOnly' });
  exchange.res.end();
  const response = exchange.response();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://tidal.com/consent');
  assert.equal(response.headers.get('x-request-id'), 'abc');
  assert.equal(response.headers.get('set-cookie'), 'flow=1; Path=/; HttpOnly');
});

test('web exchange supports write/end chunking and close callbacks', () => {
  const exchange = webExchange(new Request('https://music.example.com/mcp', { method: 'POST', body: '{}' }));
  let closed = false;
  exchange.res.once('close', () => { closed = true; });
  exchange.res.writeHead(200, { 'Content-Type': 'application/json' });
  exchange.res.write('{"ok":');
  exchange.res.end('true}');
  exchange.close();
  assert.equal(closed, true);
  return exchange.response().text().then(body => assert.equal(body, '{"ok":true}'));
});
