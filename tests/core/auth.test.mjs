import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/fixture.mjs';
import { opaque, challenge } from '../../src/core/util.mjs';
async function authorize(f,overrides={}){
  const client=await f.broker.register({redirect_uris:f.config.redirectAllowlist,client_name:'Test agent'}),verifier=opaque(48);
  const args={client_id:client.client_id,redirect_uri:client.redirect_uris[0],resource:f.config.resource,response_type:'code',scope:'tidal:read tidal:write',state:'agent-state',code_challenge:challenge(verifier),code_challenge_method:'S256',...overrides};
  const consent=await f.broker.begin(args),upstream=await f.broker.consent(consent.consentId,consent.csrf,consent.cookie,true),state=new URL(upstream.url).searchParams.get('state');
  const callback=await f.broker.callback({state,code:'synthetic-tidal-code'},consent.cookie),code=new URL(callback).searchParams.get('code');
  return {client,verifier,args,consent,state,code,tokenArgs:{grant_type:'authorization_code',client_id:client.client_id,redirect_uri:args.redirect_uri,resource:args.resource,code,code_verifier:verifier}};
}
test('PKCE authorization creates distinct MCP tokens and preserves agent state',async()=>{
  const f=await fixture(),a=await authorize(f),token=await f.broker.token(a.tokenArgs);assert.equal(token.token_type,'Bearer');assert.ok(!token.access_token.startsWith('synthetic-access'));const p=f.broker.verify(token.access_token);assert.equal(p.clientId,a.client.client_id);assert.deepEqual(p.scopes,['tidal:read','tidal:write']);assert.ok(!JSON.stringify(f.store.data.access).includes(token.access_token));
});
test('unregistered redirect URI and non-S256 PKCE are rejected',async()=>{
  const f=await fixture();await assert.rejects(f.broker.register({redirect_uris:['https://evil.example/callback']}));const c=await f.broker.register({redirect_uris:f.config.redirectAllowlist});
  const base={client_id:c.client_id,redirect_uri:c.redirect_uris[0],resource:f.config.resource,response_type:'code',code_challenge:challenge(opaque()),code_challenge_method:'S256'};
  await assert.rejects(f.broker.begin({...base,redirect_uri:'https://evil.example'}));await assert.rejects(f.broker.begin({...base,code_challenge_method:'plain'}));await assert.rejects(f.broker.begin({...base,resource:'https://wrong.example/mcp'}));
});
test('consent CSRF and browser binding are enforced before upstream login',async()=>{
  const f=await fixture(),c=await f.broker.register({redirect_uris:f.config.redirectAllowlist}),v=await f.broker.begin({client_id:c.client_id,redirect_uri:c.redirect_uris[0],resource:f.config.resource,response_type:'code',code_challenge:challenge(opaque()),code_challenge_method:'S256'});
  await assert.rejects(f.broker.consent(v.consentId,'wrong',v.cookie,true));await assert.rejects(f.broker.consent(v.consentId,v.csrf,'another-browser',true));assert.equal(f.fake.requests.length,0);
});
test('upstream callback state is single-use',async()=>{
  const f=await fixture(),a=await authorize(f);await assert.rejects(f.broker.callback({state:a.state,code:'replayed'},a.consent.cookie),e=>e.code==='invalid_request');
});
test('wrong code verifier or resource cannot exchange a bound code',async()=>{
  const f=await fixture(),a=await authorize(f);await assert.rejects(f.broker.token({...a.tokenArgs,code_verifier:opaque(48)}));await assert.rejects(f.broker.token({...a.tokenArgs,resource:'https://elsewhere/mcp'}));const token=await f.broker.token(a.tokenArgs);assert.ok(token.access_token);await assert.rejects(f.broker.token(a.tokenArgs),e=>e.code==='invalid_grant');
});
test('rotating refresh replay revokes the whole client token family',async()=>{
  const f=await fixture(),a=await authorize(f),first=await f.broker.token(a.tokenArgs),args={grant_type:'refresh_token',client_id:a.client.client_id,resource:f.config.resource,refresh_token:first.refresh_token};const second=await f.broker.token(args);assert.notEqual(second.refresh_token,first.refresh_token);assert.ok(f.broker.verify(second.access_token));await assert.rejects(f.broker.token(args),e=>e.code==='invalid_grant');assert.throws(()=>f.broker.verify(second.access_token),e=>e.code==='invalid_token');
});
test('refresh rejects scope escalation and other-client token substitution',async()=>{
  const f=await fixture(),a=await authorize(f,{scope:'tidal:read'}),token=await f.broker.token(a.tokenArgs),other=await f.broker.register({redirect_uris:f.config.redirectAllowlist});const args={grant_type:'refresh_token',client_id:a.client.client_id,resource:f.config.resource,refresh_token:token.refresh_token};await assert.rejects(f.broker.token({...args,scope:'tidal:read tidal:write'}));await assert.rejects(f.broker.token({...args,client_id:other.client_id}));
});
test('access token expiry is enforced, and refresh can renew before family expiry',async()=>{
  let time=Date.now();const f=await fixture({now:()=>time}),a=await authorize(f),token=await f.broker.token(a.tokenArgs);time+=901000;assert.throws(()=>f.broker.verify(token.access_token));const next=await f.broker.token({grant_type:'refresh_token',client_id:a.client.client_id,resource:f.config.resource,refresh_token:token.refresh_token});assert.ok(f.broker.verify(next.access_token));
});
test('concurrent upstream token refresh is single-flight',async()=>{
  const f=await fixture();await f.store.tx(s=>{s.grants[f.principal.grantId].token.expiresAt=0;});const tokens=await Promise.all(Array.from({length:20},()=>f.auth.userToken(f.principal.grantId)));assert.equal(new Set(tokens).size,1);assert.equal(f.fake.refreshes,1);
});
test('upstream refresh omission preserves prior refresh token',async()=>{
  const f=await fixture();f.fake.queue('POST','/v1/oauth2/token',new Response(JSON.stringify({access_token:'new-access',expires_in:3600,token_type:'Bearer'}),{status:200}));await f.store.tx(s=>{s.grants[f.principal.grantId].token.expiresAt=0;});await f.auth.userToken(f.principal.grantId);assert.equal(f.auth.grant(f.principal.grantId).token.refreshToken,'synthetic-initial-refresh');
});
test('invalid_grant clears upstream secrets and forces reconnect',async()=>{
  const f=await fixture();f.fake.queue('POST','/v1/oauth2/token',new Response(JSON.stringify({error:'invalid_grant'}),{status:400}));await assert.rejects(f.auth.userToken(f.principal.grantId,true));const grant=f.auth.grant(f.principal.grantId);assert.equal(grant.disabled,true);assert.equal(grant.token.accessToken,undefined);assert.equal(grant.token.refreshToken,undefined);
});
test('disconnect cannot be undone by a refresh finishing late',async()=>{
  const f=await fixture();let release;const original=f.auth.tokenRequest.bind(f.auth);f.auth.tokenRequest=async(...args)=>{await new Promise(r=>release=r);return original(...args);};const job=f.auth.userToken(f.principal.grantId,true);await f.auth.disconnect(f.principal.grantId);release();await assert.rejects(job);assert.equal(f.auth.grant(f.principal.grantId),undefined);
});
test('revocation does not reveal whether an unknown token exists',async()=>{
  const f=await fixture();await assert.doesNotReject(f.broker.revoke({client_id:'unknown',token:'not-real'}));
});
