import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { makeHttpHandler } from '../../src/core/http.mjs';
import { webExchange } from '../../src/core/web-adapter.mjs';
import { makeWebMcpHandler } from '../../src/mcp/web-handler.mjs';
import { AppError } from '../../src/core/util.mjs';
import { fixture } from '../helpers/fixture.mjs';

const widgetHtml = '<!doctype html><html><body>Netlify transport fixture</body></html>';

function makeBoundary(f) {
  const mcpHandler = makeWebMcpHandler({ service: f.service, widgetHtml, config: f.config });
  const broker = {
    verify(token) {
      if (token !== 'sdk-test-token') throw new AppError('invalid_token', 'Bearer token is invalid.', 401);
      return f.principal;
    },
  };
  const handle = makeHttpHandler({ config: f.config, broker, mcpHandler, audit: f.audit });
  return async (request, beforeHandle) => {
    const exchange = webExchange(request, { ip: '127.0.0.1' });
    beforeHandle?.(exchange.req);
    await handle(exchange.req, exchange.res);
    return exchange.response();
  };
}

test('Netlify web transport serves the official MCP client across stateless requests', async t => {
  const f = await fixture({ config: { enableWrites: false } });
  const dispatch = makeBoundary(f);
  const responses = [];
  const transport = new StreamableHTTPClientTransport(new URL(f.config.resource), {
    requestInit: { headers: { authorization: 'Bearer sdk-test-token', host: new URL(f.config.origin).host } },
    fetch: async (input, init) => {
      const response = await dispatch(new Request(input, init));
      responses.push(response);
      return response;
    },
  });
  const client = new Client({ name: 'netlify-boundary-tests', version: '1.0.0' });
  t.after(() => client.close());

  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 12);
  assert.ok(tools.some(tool => tool.name === 'tidal_search'));

  const search = await client.callTool({ name: 'tidal_search', arguments: { query: 'night', kind: 'tracks' } });
  assert.equal(search.structuredContent.ok, true);
  assert.ok(search.structuredContent.data.items.length > 0);
  const invalidSearch = await client.callTool({ name: 'tidal_search', arguments: { query: '', kind: 'tracks' } });
  assert.equal(invalidSearch.isError, true);
  const disabledPreview = await client.callTool({
    name: 'tidal_prepare_change',
    arguments: { change: { action: 'create_playlist', name: 'synthetic disabled test' } },
  });
  assert.equal(disabledPreview.isError, true);
  assert.equal(disabledPreview.structuredContent.error.code, 'WRITES_DISABLED');

  const resources = await client.listResources();
  const ui = resources.resources.find(resource => resource.uri.startsWith('ui://tidal/'));
  assert.ok(ui);
  const read = await client.readResource({ uri: ui.uri });
  assert.equal(read.contents[0].mimeType, 'text/html;profile=mcp-app');
  assert.ok(read.contents[0].text.includes('Netlify transport fixture'));

  assert.ok(responses.length >= 5);
  assert.equal(responses[0].headers.get('x-content-type-options'), 'nosniff');
  assert.ok(responses[0].headers.get('x-request-id'));
  assert.equal(f.fake.mutations, 0);
});

test('Netlify MCP boundary keeps shared authentication, Host, Origin and media checks', async () => {
  const f = await fixture({ config: { enableWrites: false } });
  const dispatch = makeBoundary(f);
  const url = f.config.resource;
  const baseHeaders = { authorization: 'Bearer sdk-test-token', host: new URL(f.config.origin).host, 'content-type': 'application/json' };
  const request = (headers = baseHeaders) => new Request(url, {
    method: 'POST', headers, body: '{}',
  });

  const unauthenticated = await dispatch(request({ host: new URL(f.config.origin).host, 'content-type': 'application/json' }));
  assert.equal(unauthenticated.status, 401);
  assert.match(unauthenticated.headers.get('www-authenticate'), /oauth-protected-resource\/mcp/);

  const invalidHost = await dispatch(request(), req => { req.headers.host = 'attacker.example'; });
  assert.equal(invalidHost.status, 421);

  const invalidOrigin = await dispatch(request({ ...baseHeaders, origin: 'https://attacker.example' }));
  assert.equal(invalidOrigin.status, 403);

  const invalidMedia = await dispatch(request({ ...baseHeaders, 'content-type': 'text/plain' }));
  assert.equal(invalidMedia.status, 415);

  const malformedJson = await dispatch(new Request(url, {
    method: 'POST', headers: baseHeaders, body: '{',
  }));
  assert.equal(malformedJson.status, 400);

  const oversizedAnnounced = await dispatch(new Request(url, {
    method: 'POST', headers: { ...baseHeaders, 'content-length': '131073' }, body: '{}',
  }));
  assert.equal(oversizedAnnounced.status, 413);

  const oversizedStream = await dispatch(new Request(url, {
    method: 'POST', headers: baseHeaders, body: 'x'.repeat(131073),
  }));
  assert.equal(oversizedStream.status, 413);
  assert.equal(f.fake.mutations, 0);
});
