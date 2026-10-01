/** Adapts a web-standard Request/Response pair to the Node-style (req,res) surface used by
 * makeHttpHandler. The original Request remains available to the Netlify MCP adapter, which
 * passes it to the official web-standard transport after shared auth and body checks. */
export function webExchange(request, { ip = 'unknown' } = {}) {
  const url = new URL(request.url);
  const headers = {};
  for (const [name, value] of request.headers) headers[name.toLowerCase()] = value;
  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    webRequest: request,
    socket: { remoteAddress: ip },
    async *[Symbol.asyncIterator]() {
      if (!request.body) return;
      for await (const chunk of request.body) yield Buffer.from(chunk);
    },
    once() {},
    on() {},
  };
  const out = { statusCode: 200, headers: {}, chunks: [], ended: false, headersSent: false };
  const res = {
    get statusCode() { return out.statusCode; },
    set statusCode(value) { out.statusCode = value; },
    get headersSent() { return out.headersSent; },
    setHeader(name, value) { out.headers[name.toLowerCase()] = value; return res; },
    getHeader(name) { return out.headers[name.toLowerCase()]; },
    removeHeader(name) { delete out.headers[name.toLowerCase()]; },
    writeHead(status, headers = {}) {
      out.statusCode = status; out.headersSent = true;
      for (const [name, value] of Object.entries(headers)) out.headers[name.toLowerCase()] = value;
      return res;
    },
    write(chunk) { if (chunk) out.chunks.push(Buffer.from(chunk)); return true; },
    end(chunk) { if (chunk) out.chunks.push(Buffer.from(chunk)); out.ended = true; out.headersSent = true; return res; },
    once(event, callback) { if (event === 'close') out.onClose = callback; },
    on() {},
  };
  return {
    req,
    res,
    response() {
      const headers = new Headers();
      for (const [name, value] of Object.entries(out.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, String(item));
        else headers.set(name, String(value));
      }
      const body = out.chunks.length ? Buffer.concat(out.chunks) : null;
      return new Response(body, { status: out.statusCode, headers });
    },
    close() { out.onClose?.(); },
  };
}
