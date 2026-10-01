import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { createMcpServer } from './server.mjs';

/**
 * Bridges the shared Node-style HTTP authorization handler to the official
 * web-standard MCP transport used by serverless Request/Response runtimes.
 */
export function makeWebMcpHandler({ service, widgetHtml, config }) {
  return async (req, res, parsedBody, principal) => {
    const server = createMcpServer({ service, getPrincipal: () => principal, widgetHtml, config });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    const authInfo = {
      token: req.headers.authorization.slice(7),
      clientId: principal.clientId,
      scopes: principal.scopes,
      expiresAt: principal.expiresAt,
      extra: { sub: principal.subject, grantId: principal.grantId },
    };
    let response;
    let responseBody;
    try {
      await server.connect(transport);
      response = await transport.handleRequest(req.webRequest, { parsedBody, authInfo });
      responseBody = response.body === null ? null : Buffer.from(await response.arrayBuffer());
    } finally {
      // Web-standard responses may still be streaming when handleRequest resolves.
      // Consume the body first so closing the per-request server cannot cut it off.
      await server.close();
    }
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(responseBody === null ? undefined : responseBody);
  };
}
