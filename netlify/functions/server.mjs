import { getStore } from '@netlify/blobs';
import { makeRuntime } from '../../src/runtime.mjs';
import { makeHttpHandler } from '../../src/core/http.mjs';
import { webExchange } from '../../src/core/web-adapter.mjs';
import { BlobsStore, BlobsAudit } from '../../src/core/blobs-store.mjs';
import { config as readConfig } from '../../src/core/config.mjs';
import { sdkSend } from '../../src/adapters/tidal-sdk.mjs';
import widgetHtml from '../../dist/widget-resource.mjs';

// One runtime per warm instance: the whole state document is CAS-persisted to a site-wide
// Blobs store on every transaction (see src/core/blobs-store.mjs for the concurrency contract).
let runtimePromise;
function getRuntime() {
  return runtimePromise ??= (async () => {
    const config = readConfig();
    const blobs = getStore('tidal-state');
    const store = await new BlobsStore(blobs, config.key).load();
    const audit = await new BlobsAudit(blobs).load();
    return await makeRuntime({ config, send: sdkSend, store, audit });
  })();
}
const routes = ['/mcp', '/healthz', '/register', '/authorize', '/consent', '/tidal/callback', '/token', '/revoke',
  '/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server'];
export const config = { path: routes };

export default async (request, context) => {
  const runtime = await getRuntime();
  const mcpHandler = async (req, res, body, principal) => {
    const [{ createMcpServer }, { NodeStreamableHTTPServerTransport }] = await Promise.all([
      import('../../src/mcp/server.mjs'), import('@modelcontextprotocol/node'),
    ]);
    const server = createMcpServer({ service: runtime.service, getPrincipal: () => principal, widgetHtml, config: runtime.config });
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    req.auth = { token: req.headers.authorization.slice(7), clientId: principal.clientId, scopes: principal.scopes, expiresAt: principal.expiresAt, extra: { sub: principal.subject, grantId: principal.grantId } };
    let closed = false;
    const close = () => { if (!closed) { closed = true; void server.close(); } };
    res.once('close', close);
    try { await server.connect(transport); await transport.handleRequest(req, res, body); } catch (error) { close(); throw error; }
  };
  const handler = makeHttpHandler({ config: runtime.config, broker: runtime.broker, audit: runtime.audit, mcpHandler });
  const exchange = webExchange(request, { ip: context?.ip });
  try {
    await handler(exchange.req, exchange.res);
    return exchange.response();
  } finally {
    exchange.close();
    await runtime.audit.flush?.();
  }
};
