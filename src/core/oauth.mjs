import { fail, opaque, sha256, challenge, equalSecret } from './util.mjs';
import { READ_SCOPES, WRITE_SCOPES } from './upstream-auth.mjs';
const TEN_MIN=600000, FIVE_MIN=300000, ACCESS_TTL=900000, FAMILY_TTL=30*86400000;
const required = (params,key,max=2048) => {
  const v=params[key];if(typeof v!=='string'||!v||v.length>max)fail('invalid_request',`Missing or invalid ${key}.`);return v;
};
export class OAuthBroker {
  constructor({store,auth,config,now=Date.now}) {Object.assign(this,{store,auth,config,now});}
  metadata() {return {issuer:this.config.origin,authorization_endpoint:this.config.origin+'/authorize',token_endpoint:this.config.origin+'/token',registration_endpoint:this.config.origin+'/register',revocation_endpoint:this.config.origin+'/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],revocation_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:this.config.enableWrites?['tidal:read','tidal:write']:['tidal:read']};}
  resourceMetadata() {return {resource:this.config.resource,authorization_servers:[this.config.origin],scopes_supported:this.metadata().scopes_supported,bearer_methods_supported:['header'],resource_name:'TIDAL MCP App'};}
  async register(input) {
    const redirects=input?.redirect_uris;
    if(!Array.isArray(redirects)||!redirects.length||redirects.length>5||new Set(redirects).size!==redirects.length)fail('invalid_client_metadata','Provide one to five unique redirect URIs.');
    for(const uri of redirects) {
      if(typeof uri!=='string'||!this.config.redirectAllowlist.includes(uri))fail('invalid_redirect_uri','Redirect URI must be explicitly approved by this server operator.');
      const url=new URL(uri);if(url.searchParams.has('code')||url.searchParams.has('state'))fail('invalid_redirect_uri','Redirect URI must not contain reserved OAuth query parameters.');
    }
    if(input.token_endpoint_auth_method && input.token_endpoint_auth_method!=='none')fail('invalid_client_metadata','This server supports PKCE public clients with token_endpoint_auth_method=none.');
    if(input.response_types && (!Array.isArray(input.response_types)||input.response_types.some(v=>v!=='code')))fail('invalid_client_metadata','Only the code response type is supported.');
    if(input.grant_types && (!Array.isArray(input.grant_types)||input.grant_types.some(v=>!['authorization_code','refresh_token'].includes(v))))fail('invalid_client_metadata','Unsupported grant type.');
    const name=typeof input.client_name==='string'?input.client_name.slice(0,100):'MCP client';
    const client={client_id:opaque(24),client_name:name,redirect_uris:redirects,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],client_id_issued_at:Math.floor(this.now()/1000)};
    await this.store.tx(s=>{if(Object.keys(s.clients).length>=128)fail('temporarily_unavailable','Registration capacity reached; contact the server operator.',503);s.clients[client.client_id]=client;});
    return client;
  }
  async begin(params) {
    await this.prune();
    const clientId=required(params,'client_id'),redirectUri=required(params,'redirect_uri');
    const client=this.store.read(s=>s.clients[clientId]);
    if(!client)fail('invalid_client','Unknown OAuth client.');
    if(!client.redirect_uris.includes(redirectUri)||!this.config.redirectAllowlist.includes(redirectUri))fail('invalid_redirect_uri','Redirect URI does not exactly match an approved registration.');
    if(params.response_type!=='code')fail('unsupported_response_type','Only authorization code is supported.');
    if(params.resource!==this.config.resource)fail('invalid_target','Resource must equal this server’s canonical MCP resource URI.');
    const codeChallenge=required(params,'code_challenge',128);
    if(params.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge))fail('invalid_request','A valid S256 PKCE challenge is required.');
    if(params.state!==undefined&&(typeof params.state!=='string'||params.state.length>2048))fail('invalid_request','Invalid state.');
    const scopes=[...new Set((params.scope || 'tidal:read').split(/\s+/).filter(Boolean))];
    if(!scopes.includes('tidal:read')||scopes.some(s=>!this.metadata().scopes_supported.includes(s)))fail('invalid_scope','Unsupported scope; tidal:read is required and writes need operator opt-in.');
    const consentId=opaque(),csrf=opaque(),cookie=opaque();
    const pending={kind:'consent',clientId,clientName:client.client_name,redirectUri,resource:params.resource,scopes,codeChallenge,state:params.state||'',cookieHash:sha256(cookie),csrfHash:sha256(csrf),expiresAt:this.now()+TEN_MIN};
    await this.store.tx(s=>{if(Object.keys(s.pending).length>=512)fail('temporarily_unavailable','Too many pending authorizations.',503);s.pending[sha256(consentId)]=pending;});
    return {consentId,csrf,cookie,clientName:pending.clientName,scopes,redirectUri};
  }
  async consent(consentId,csrf,cookie,approved) {
    const key=sha256(consentId||'');
    const pending=this.store.read(s=>s.pending[key]);
    if(!pending||pending.kind!=='consent'||pending.expiresAt<=this.now()||!equalSecret(pending.cookieHash,sha256(cookie||''))||!equalSecret(pending.csrfHash,sha256(csrf||'')))fail('invalid_request','Consent session expired or browser/CSRF binding failed.');
    await this.store.tx(s=>{delete s.pending[key];});
    if(!approved)return {url:this.clientRedirect(pending,{error:'access_denied'})};
    const state=opaque(),scopes=[...READ_SCOPES,...(pending.scopes.includes('tidal:write')?WRITE_SCOPES:[])];
    const login=this.auth.loginUrl(state,scopes);
    await this.store.tx(s=>{s.pending[sha256(state)]={...pending,kind:'upstream',verifier:login.verifier,upstreamScopes:scopes,expiresAt:this.now()+TEN_MIN};});
    return {url:login.url};
  }
  clientRedirect(pending,values) {
    const url=new URL(pending.redirectUri);for(const[k,v]of Object.entries(values))url.searchParams.set(k,v);if(pending.state)url.searchParams.set('state',pending.state);return url.href;
  }
  async callback(params,cookie) {
    const state=required(params,'state'),key=sha256(state),pending=this.store.read(s=>s.pending[key]);
    if(!pending||pending.kind!=='upstream'||pending.expiresAt<=this.now()||!equalSecret(pending.cookieHash,sha256(cookie||'')))fail('invalid_request','TIDAL callback is stale, was replayed, or came from another browser.');
    // Consume before network I/O. A failed exchange requires a fresh authorization, not replay.
    await this.store.tx(s=>{delete s.pending[key];});
    if(params.error)return this.clientRedirect(pending,{error:'access_denied'});
    const code=required(params,'code',8192);
    const token=await this.auth.exchange(code,pending.verifier,this.config.callback,pending.upstreamScopes);
    const identity=await this.auth.identify(token);
    const grantId=await this.auth.saveGrant(token,identity),downstreamCode=opaque();
    await this.store.tx(s=>{s.codes[sha256(downstreamCode)]={clientId:pending.clientId,redirectUri:pending.redirectUri,resource:pending.resource,scopes:pending.scopes,codeChallenge:pending.codeChallenge,grantId,expiresAt:this.now()+FIVE_MIN};});
    return this.clientRedirect(pending,{code:downstreamCode});
  }
  async token(params) {
    await this.prune();
    const clientId=required(params,'client_id');
    if(!this.store.read(s=>s.clients[clientId]))fail('invalid_client','Unknown client.',401);
    if(params.resource!==this.config.resource)fail('invalid_target','Incorrect or missing resource indicator.');
    if(params.client_secret!==undefined)fail('invalid_client','This registered public client uses PKCE, not a client secret.',401);
    if(params.grant_type==='authorization_code') {
      const key=sha256(required(params,'code',8192)),verifier=required(params,'code_verifier',128);
      if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))fail('invalid_grant','Invalid PKCE verifier.');
      const code=this.store.read(s=>s.codes[key]);
      if(!code||code.expiresAt<=this.now()||code.clientId!==clientId||code.resource!==params.resource||code.redirectUri!==params.redirect_uri||!equalSecret(code.codeChallenge,challenge(verifier)))fail('invalid_grant','Authorization code is invalid, expired or incorrectly bound.');
      const grant=this.auth.grant(code.grantId);if(!grant||grant.disabled)fail('invalid_grant','Account grant is no longer available.');
      return await this.store.tx(s=>{
        delete s.codes[key];
        const familyId=opaque();s.families[familyId]={grantId:code.grantId,clientId,resource:code.resource,scopes:code.scopes,expiresAt:this.now()+FAMILY_TTL,revoked:false};
        return this.issue(s,familyId);
      });
    }
    if(params.grant_type==='refresh_token') {
      const key=sha256(required(params,'refresh_token',8192));
      const refresh=this.store.read(s=>s.refresh[key]);
      if(!refresh)fail('invalid_grant','Refresh token is invalid or expired.');
      const family=this.store.read(s=>s.families[refresh.familyId]);
      if(!family||family.clientId!==clientId||family.resource!==params.resource||family.expiresAt<=this.now()||family.revoked)fail('invalid_grant','Refresh grant is no longer valid.');
      if(refresh.used) {await this.store.tx(s=>{s.families[refresh.familyId].revoked=true;});fail('invalid_grant','Refresh token replay detected; this client grant was revoked. Reconnect.');}
      if(params.scope && (!params.scope.split(/\s+/).includes('tidal:read') || params.scope.split(/\s+/).some(v=>!family.scopes.includes(v))))fail('invalid_scope','Refresh cannot expand granted permissions.');
      const grant=this.auth.grant(family.grantId);if(!grant||grant.disabled)fail('invalid_grant','TIDAL account was disconnected.');
      return await this.store.tx(s=>{s.refresh[key].used=true;return this.issue(s,refresh.familyId,params.scope?.split(/\s+/).filter(Boolean));});
    }
    fail('unsupported_grant_type','Only authorization_code and refresh_token grants are supported.');
  }
  issue(state,familyId,requestedScopes) {
    const family=state.families[familyId],access=opaque(),refresh=opaque();
    // Narrowing is sticky for this family; an old token cannot later re-expand it.
    if(requestedScopes)family.scopes=[...new Set(requestedScopes)];
    const expiresAt=Math.min(this.now()+ACCESS_TTL,family.expiresAt);
    state.access[sha256(access)]={familyId,grantId:family.grantId,clientId:family.clientId,resource:family.resource,scopes:[...family.scopes],expiresAt};
    state.refresh[sha256(refresh)]={familyId,used:false};
    return {access_token:access,token_type:'Bearer',expires_in:Math.floor((expiresAt-this.now())/1000),refresh_token:refresh,scope:family.scopes.join(' ')};
  }
  verify(raw) {
    if(typeof raw!=='string'||raw.length>8192)fail('invalid_token','Missing or invalid bearer token.',401);
    const access=this.store.read(s=>s.access[sha256(raw)]),family=access&&this.store.read(s=>s.families[access.familyId]);
    if(!access||!family||family.revoked||access.expiresAt<=this.now()||family.expiresAt<=this.now()||access.resource!==this.config.resource)fail('invalid_token','Token is expired, revoked or intended for another resource.',401);
    const grant=this.auth.grant(access.grantId);
    if(!grant||grant.disabled)fail('invalid_token','TIDAL account grant is disconnected.',401);
    if(!access.scopes.includes('tidal:read'))fail('insufficient_scope','tidal:read is required.',403);
    return {grantId:access.grantId,subject:grant.subject,clientId:access.clientId,scopes:access.scopes,expiresAt:Math.floor(access.expiresAt/1000)};
  }
  async revoke(params) {
    const clientId=required(params,'client_id'),key=sha256(required(params,'token',8192));
    await this.store.tx(s=>{const record=s.access[key]||s.refresh[key];const family=record&&s.families[record.familyId];if(family&&family.clientId===clientId)family.revoked=true;});
  }
  async prune() {
    const now=this.now();
    await this.store.tx(s=>{
      for(const table of ['pending','codes','access','families'])for(const[k,v]of Object.entries(s[table]))if(v.expiresAt<=now)delete s[table][k];
      for(const[k,v]of Object.entries(s.refresh))if(!s.families[v.familyId])delete s.refresh[k];
      for(const[k,v]of Object.entries(s.plans))if((v.retryUntil||v.expiresAt)+86400000<now)delete s.plans[k];
      const used=new Set([...Object.values(s.profiles),...Object.values(s.families).map(f=>f.grantId),...Object.values(s.codes).map(c=>c.grantId)]);
      for(const[k,v]of Object.entries(s.grants))if(!used.has(k)&&v.createdAt+86400000<now)delete s.grants[k];
    });
  }
}
