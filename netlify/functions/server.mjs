import { getStore } from '@netlify/blobs';
import { makeRuntime } from '../../src/runtime.mjs';
import { makeHttpHandler } from '../../src/core/http.mjs';
import { webExchange } from '../../src/core/web-adapter.mjs';
import { makeWebMcpHandler } from '../../src/mcp/web-handler.mjs';
import { BlobsStore, BlobsAudit } from '../../src/core/blobs-store.mjs';
import { config as readConfig } from '../../src/core/config.mjs';
import { sdkSend } from '../../src/adapters/tidal-sdk.mjs';
import widgetHtml from '../../dist/widget-resource.mjs';

// One runtime per warm instance: the whole state document is CAS-persisted to a site-wide
// Blobs store on every transaction (see src/core/blobs-store.mjs for the concurrency contract).
// Routes are exposed via the generated dist/_redirects file (200! rewrites to this
// function's default path). netlify.toml [[redirects]] were silently not processed and
// config.path proved unreliable; the deploy-upload _redirects file is what works.
let runtimePromise;
function getRuntime() {
  return runtimePromise ??= (async () => {
    const config = readConfig();
    const blobs = getStore({ name: 'tidal-state', consistency: 'strong' });
    const store = await new BlobsStore(blobs, config.key).load();
    const audit = await new BlobsAudit(blobs).load();
    return await makeRuntime({ config, send: sdkSend, store, audit });
  })();
}
export default async (request, context) => {
  const runtime = await getRuntime();
  return runtime.store.withFreshState(async () => {
    const mcpHandler = makeWebMcpHandler({ service: runtime.service, widgetHtml, config: runtime.config });
    const handler = makeHttpHandler({ config: runtime.config, broker: runtime.broker, audit: runtime.audit, mcpHandler });
    const exchange = webExchange(request, { ip: context?.ip });
    try {
      await handler(exchange.req, exchange.res);
      return exchange.response();
    } finally {
      exchange.close();
      await runtime.audit.flush?.();
    }
  });
};
