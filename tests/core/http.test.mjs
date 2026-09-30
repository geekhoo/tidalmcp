import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fixture } from '../helpers/fixture.mjs';
import { httpServer, parameters } from '../../src/core/http.mjs';
import { opaque, challenge } from '../../src/core/util.mjs';
async function setup(t){
 const f=await fixture(),received=[];
 const server=httpServer({config:f.config,broker:f.broker,audit:f.audit,mcpHandler:async(req,res,body,principal)=>{received.push({principal,body});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({testOnly:'HTTP authorization boundary reached'}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;Object.assign(f.config,{origin,resource:origin+'/mcp',callback:origin+'/tidal/callback'});
 t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));return {...f,server,received,origin};
}
const post=(f,path,body,headers={})=>fetch(f.origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),redirect:'manual'});
const form=(f,path,body,headers={})=>fetch(f.origin+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(body),redirect:'manual'});
async function connect(f){
 const client=await (await post(f,'/register',{redirect_uris:f.config.redirectAllowlist,client_name:'<script>bad()</script>'})).json(),verifier=opaque(48);
 const query=new URLSearchParams({client_id:client.client_id,redirect_uri:client.redirect_uris[0],resource:f.config.resource,response_type:'code',code_challenge:challenge(verifier),code_challenge_method:'S256',state:'preserve-agent-state',scope:'tidal:read tidal:write'});
 const consent=await fetch(f.origin+'/authorize?'+query),html=await consent.text(),cookie=consent.headers.get('set-cookie').split(';')[0];assert.ok(!html.includes('<script>bad()'));assert.ok(html.includes('&lt;script&gt;'));
 const consentId=html.match(/name="consent_id" value="([^"]+)"/)[1],csrf=html.match(/name="csrf" value="([^"]+)"/)[1];
 const approved=await form(f,'/consent',{consent_id:consentId,csrf,decision:'approve'},{Origin:f.origin,Cookie:cookie});assert.equal(approved.status,302);
 const upstream=new URL(approved.headers.get('location'));assert.equal(upstream.origin,'https://login.tidal.com');assert.equal(upstream.searchParams.get('code_challenge_method'),'S256');
 const callback=await fetch(f.origin+'/tidal/callback?'+new URLSearchParams({state:upstream.searchParams.get('state'),code:'synthetic-auth-code'}),{headers:{Cookie:cookie},redirect:'manual'});assert.equal(callback.status,302);
 const target=new URL(callback.headers.get('location'));assert.equal(target.searchParams.get('state'),'preserve-agent-state');
 const tokenResponse=await form(f,'/token',{grant_type:'authorization_code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],resource:f.config.resource,code:target.searchParams.get('code'),code_verifier:verifier});assert.equal(tokenResponse.status,200);
 return {client,token:await tokenResponse.json()};
}
test('HTTP OAuth consent, PKCE callback, token exchange, and principal binding work end-to-end',async t=>{const f=await setup(t),{token,client}=await connect(f);assert.ok(!token.access_token.includes('synthetic'));const r=await post(f,'/mcp',{test:true},{Authorization:'Bearer '+token.access_token});assert.equal(r.status,200);assert.equal(f.received[0].principal.clientId,client.client_id);assert.equal(f.received[0].principal.subject,'demo-user');assert.equal(f.received[0].principal.scopes.includes('tidal:write'),true);assert.ok(!JSON.stringify(await r.json()).includes('access_token'));});
test('HTTP unauthenticated MCP requests are challenged before tool dispatch',async t=>{const f=await setup(t);const r=await post(f,'/mcp',{});assert.equal(r.status,401);assert.ok(r.headers.get('www-authenticate').includes('/.well-known/oauth-protected-resource/mcp'));assert.equal(f.received.length,0);});
test('OAuth discovery advertises exact resource and public S256 client flow',async t=>{const f=await setup(t),m=await(await fetch(f.origin+'/.well-known/oauth-authorization-server')).json(),r=await(await fetch(f.origin+'/.well-known/oauth-protected-resource/mcp')).json();assert.equal(m.issuer,f.origin);assert.deepEqual(m.code_challenge_methods_supported,['S256']);assert.equal(r.resource,f.config.resource);assert.deepEqual(m.token_endpoint_auth_methods_supported,['none']);});
test('Host header and unapproved browser Origin are rejected',async t=>{const f=await setup(t);const hostile=await new Promise((resolve,reject)=>{const req=http.get(f.origin+'/healthz',{headers:{Host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);});req.on('error',reject);});assert.equal(hostile,421);const r=await post(f,'/register',{}, {Origin:'https://evil.example'});assert.equal(r.status,403);});
test('malformed JSON and duplicate OAuth form parameters fail without leaking data',async t=>{const f=await setup(t);const r=await fetch(f.origin+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(r.status,400);assert.throws(()=>parameters('code=one&code=two'));assert.throws(()=>parameters('__proto__=bad'));});
test('oversized authorization payloads fail with 413',async t=>{const f=await setup(t),r=await post(f,'/register',{data:'x'.repeat(140000)});assert.equal(r.status,413);});
test('revoked MCP access is denied on the next HTTP request',async t=>{const f=await setup(t),{client,token}=await connect(f);const revoked=await form(f,'/revoke',{client_id:client.client_id,token:token.refresh_token});assert.equal(revoked.status,200);const r=await post(f,'/mcp',{}, {Authorization:'Bearer '+token.access_token});assert.equal(r.status,401);assert.equal(f.received.length,0);});
