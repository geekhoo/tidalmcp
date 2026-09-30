import { createServer } from 'node:http';
import { AppError, fail, opaque, escapeHtml, publicError } from './util.mjs';
const MAX_BODY=131072;
export async function requestBody(req) {
  if(Number(req.headers['content-length'])>MAX_BODY)fail('invalid_request','Request body is too large.',413);
  const buffers=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BODY)fail('invalid_request','Request body is too large.',413);buffers.push(chunk);}
  return Buffer.concat(buffers).toString('utf8');
}
export function parameters(search) {
  const entries=search instanceof URLSearchParams?search:new URLSearchParams(search),out={};
  for(const[k,v]of entries){if(Object.hasOwn(out,k)||['__proto__','prototype','constructor'].includes(k))fail('invalid_request','Duplicate or unsafe parameter name.');out[k]=v;}
  return out;
}
export function sendJson(res,status,body,headers={}) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body));}
export function cookieValue(header,name) {return String(header||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);}
export function makeHttpHandler({config,broker,mcpHandler,audit}) {
  const cookieName=config.local?'tidal_mcp_flow':'__Host-tidal_mcp_flow';
  const limits=new Map();let globalWindow=0,globalCount=0;
  const rateLimit=req=>{
    const now=Date.now(),window=Math.floor(now/60000),key=req.socket.remoteAddress||'unknown';
    if(globalWindow!==window){globalWindow=window;globalCount=0;limits.clear();}
    const count=(limits.get(key)||0)+1;limits.set(key,count);globalCount++;
    if(count>90||globalCount>600)fail('rate_limited','Too many authorization requests. Retry later.',429);
  };
  const redirect=(res,url,clear=false)=>{res.writeHead(302,{Location:url,'Cache-Control':'no-store',...(clear?{'Set-Cookie':`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.local?'':'; Secure'}`}:{})});res.end();};
  return async(req,res)=>{
    const requestId=opaque(12);res.setHeader('X-Request-Id',requestId);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    if(!config.local)res.setHeader('Strict-Transport-Security','max-age=31536000');
    let route='unknown',status=500;
    try {
      // Trust the configured public Host, never forwarded headers supplied by a caller.
      if(req.headers.host!==new URL(config.origin).host)fail('invalid_request','Host header is not allowed.',421);
      const url=new URL(req.url,config.origin);route=url.pathname;
      if(url.origin!==config.origin)fail('invalid_request','Absolute request target is not allowed.');
      const origin=req.headers.origin;
      // Origin is only meaningful on state-changing requests; embedded browser panes may
      // send 'null' (opaque webview origin). Token auth, the flow cookie and CSRF still bind
      // these routes; cross-origin reads stay blocked because CORS headers are never granted.
      if(!['GET','HEAD'].includes(req.method)&&origin&&origin!=='null'&&origin!==config.origin&&!config.allowedOrigins.includes(origin))fail('invalid_request','Origin is not allowed.',403);
      if(origin && config.allowedOrigins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Expose-Headers','WWW-Authenticate, MCP-Session-Id, MCP-Protocol-Version, X-Request-Id');}
      if(req.method==='OPTIONS') {
        if(!origin)fail('invalid_request','Origin required for preflight.');
        res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Accept'});res.end();status=204;return;
      }
      if(route==='/healthz'&&req.method==='GET'){status=200;return sendJson(res,200,{status:'ok',service:'tidal-mcp-app'});}
      if(route==='/mcp') {
        const header=req.headers.authorization;
        let principal;
        try {if(typeof header!=='string'||!/^Bearer [A-Za-z0-9_-]+$/.test(header))fail('invalid_token','Bearer authorization is required.',401);principal=broker.verify(header.slice(7));}
        catch(error){res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/mcp", error="${error.code==='insufficient_scope'?'insufficient_scope':'invalid_token'}", scope="tidal:read"`);throw error;}
        if(req.method!=='POST'){status=405;return sendJson(res,405,{error:'method_not_allowed'},{Allow:'POST, OPTIONS'});}
        if(!String(req.headers['content-type']).toLowerCase().startsWith('application/json'))fail('invalid_request','MCP requests require application/json.',415);
        let body;try{body=JSON.parse(await requestBody(req));}catch(error){if(error instanceof AppError)throw error;fail('invalid_request','Malformed JSON.');}
        await mcpHandler(req,res,body,principal);status=res.statusCode;return;
      }
      const metadataRoutes=['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'];
      if(metadataRoutes.includes(route)&&req.method==='GET'){status=200;return sendJson(res,200,broker.resourceMetadata());}
      if(route==='/.well-known/oauth-authorization-server'&&req.method==='GET'){status=200;return sendJson(res,200,broker.metadata());}
      if(['/register','/authorize','/consent','/tidal/callback','/token','/revoke'].includes(route))rateLimit(req);
      if(route==='/register'&&req.method==='POST') {
        if(!String(req.headers['content-type']).startsWith('application/json'))fail('invalid_request','Registration requires application/json.',415);
        let body;try{body=JSON.parse(await requestBody(req));}catch(error){if(error instanceof AppError)throw error;fail('invalid_request','Malformed JSON.');}
        status=201;return sendJson(res,201,await broker.register(body));
      }
      if(route==='/authorize'&&req.method==='GET') {
        const view=await broker.begin(parameters(url.searchParams));status=200;
        res.setHeader('Set-Cookie',`${cookieName}=${view.cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${config.local?'':'; Secure'}`);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize TIDAL MCP</title><style>body{font:16px/1.5 system-ui;color:#2a302e;background:#fcfcfc;margin:40px auto;padding:24px;max-width:640px}button{padding:10px 18px;margin:12px 8px 0 0;border:1px solid #cfceca;border-radius:9999px;background:white;color:#2a302e;cursor:pointer}button[value=approve]{background:#2a302e;color:white}code{overflow-wrap:anywhere}button:focus-visible{outline:3px solid #2c5d63;outline-offset:3px}</style><main><h1>Connect your TIDAL account</h1><p><strong>${escapeHtml(view.clientName)}</strong> requests access through this MCP server.</p><p>Permissions: <strong>${escapeHtml(view.scopes.join(', '))}</strong>.</p><p>${view.scopes.includes('tidal:write')?'This permits changes to playlists and saved music. Only approve a client you trust to follow your instructions.':'This is read-only access to your profile, playlists and saved music.'}</p><p>You will authenticate on TIDAL. Your TIDAL tokens stay on this server and are not sent to the AI client.</p><p>Client callback: <code>${escapeHtml(view.redirectUri)}</code></p><form method="post" action="/consent"><input type="hidden" name="consent_id" value="${escapeHtml(view.consentId)}"><input type="hidden" name="csrf" value="${escapeHtml(view.csrf)}"><button name="decision" value="approve">Continue to TIDAL</button><button name="decision" value="deny">Cancel</button></form></main></html>`);return;
      }
      if(route==='/consent'&&req.method==='POST') {
        if(origin!==config.origin&&origin!=='null')fail('invalid_request','Consent requires a same-origin browser submission.',403);
        if(!String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded'))fail('invalid_request','Expected form body.',415);
        const form=parameters(await requestBody(req));const result=await broker.consent(form.consent_id,form.csrf,cookieValue(req.headers.cookie,cookieName),form.decision==='approve');status=302;return redirect(res,result.url,form.decision!=='approve');
      }
      if(route==='/tidal/callback'&&req.method==='GET') {const destination=await broker.callback(parameters(url.searchParams),cookieValue(req.headers.cookie,cookieName));status=302;return redirect(res,destination,true);}
      if((route==='/token'||route==='/revoke')&&req.method==='POST') {
        if(req.headers.authorization)fail('invalid_client','Use public-client client_id and PKCE; Basic authentication is not supported here.',401);
        if(!String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded'))fail('invalid_request','Expected application/x-www-form-urlencoded.',415);
        const form=parameters(await requestBody(req));status=200;
        if(route==='/revoke'){await broker.revoke(form);return sendJson(res,200,{});}return sendJson(res,200,await broker.token(form));
      }
      status=404;sendJson(res,404,{error:'not_found'});
    }catch(error){status=error instanceof AppError?error.status:500;if(!res.headersSent)sendJson(res,status,{error:error instanceof AppError?error.code:'server_error',error_description:publicError(error).message,requestId});else res.end();}
    finally {audit?.write({event:'http.request',requestId,route:['/mcp','/healthz','/register','/authorize','/consent','/tidal/callback','/token','/revoke','/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(route)?route:'unmatched',method:req.method,status});}
  };
}
export function httpServer(options) {
  const server=createServer(makeHttpHandler(options));server.requestTimeout=20000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=50;return server;
}
