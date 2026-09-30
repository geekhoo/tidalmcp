import path from 'node:path';
import { fail } from './util.mjs';
const list = x => (x || '').split(',').map(s=>s.trim()).filter(Boolean);
export function config(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('CONFIG_ERROR','Invalid PORT.',500);
  const origin = new URL(env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`);
  const local = ['127.0.0.1','localhost','[::1]'].includes(origin.hostname);
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) fail('CONFIG_ERROR','PUBLIC_ORIGIN must be an HTTPS origin, or a loopback HTTP origin without a path.',500);
  const keyText = env.TOKEN_ENCRYPTION_KEY || '';
  const key=Buffer.from(keyText,'base64');
  if (key.length !== 32 || key.toString('base64') !== keyText) fail('CONFIG_ERROR','Set TOKEN_ENCRYPTION_KEY to exactly 32 bytes in standard base64; run npm run keygen.',500);
  if (!env.TIDAL_CLIENT_ID) fail('CONFIG_ERROR','TIDAL_CLIENT_ID is required.',500);
  const country = (env.DEFAULT_COUNTRY || 'SG').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) fail('CONFIG_ERROR','DEFAULT_COUNTRY must be a two-letter country code.',500);
  const redirectAllowlist=list(env.OAUTH_REDIRECT_ALLOWLIST);
  for (const value of redirectAllowlist) {
    const uri=new URL(value), loopback=['localhost','127.0.0.1','[::1]'].includes(uri.hostname);
    if (uri.username || uri.password || uri.hash || !(uri.protocol==='https:' || (loopback && uri.protocol==='http:'))) fail('CONFIG_ERROR','OAuth redirect allowlist contains an unsafe URI.',500);
  }
  const allowedOrigins=list(env.ALLOWED_ORIGINS);
  for (const value of allowedOrigins) if (new URL(value).origin !== value) fail('CONFIG_ERROR','ALLOWED_ORIGINS must contain exact serialized origins.',500);
  const widgetDomain=env.WIDGET_DOMAIN || undefined;
  if (widgetDomain && (new URL(widgetDomain).origin!==widgetDomain || !widgetDomain.startsWith('https://'))) fail('CONFIG_ERROR','WIDGET_DOMAIN must be an HTTPS origin.',500);
  const host = env.LISTEN_HOST || '127.0.0.1';
  if (local && !['127.0.0.1','localhost','::1'].includes(host)) fail('CONFIG_ERROR','Loopback PUBLIC_ORIGIN cannot be combined with a public bind address.',500);
  return Object.freeze({port,host,origin:origin.origin,resource:origin.origin+'/mcp',callback:origin.origin+'/tidal/callback',local,clientId:env.TIDAL_CLIENT_ID,clientSecret:env.TIDAL_CLIENT_SECRET || '',key,dataDir:path.resolve(env.DATA_DIR || './var'),country,enableWrites:env.ENABLE_WRITES==='true',redirectAllowlist,allowedOrigins,widgetDomain,profile:env.LOCAL_PROFILE || 'local'});
}
