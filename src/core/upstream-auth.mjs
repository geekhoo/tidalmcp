import { AppError, fail, opaque, challenge, readLimited, jsonText } from './util.mjs';
export const TIDAL_TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';
export const TIDAL_AUTHORIZE_URL = 'https://login.tidal.com/authorize';
export const TIDAL_API = 'https://openapi.tidal.com/v2';
export const READ_SCOPES = ['user.read','collection.read','playlists.read','search.read'];
export const WRITE_SCOPES = ['collection.write','playlists.write'];
export class UpstreamAuth {
  constructor({store, config, fetchImpl=fetch, now=Date.now}) { Object.assign(this,{store,config,fetchImpl,now});this.inflight=new Map();this.appToken=null; }
  loginUrl(state, scopes, redirectUri = this.config.callback) {
    const verifier = opaque(48), url = new URL(TIDAL_AUTHORIZE_URL);
    for (const [k,v] of Object.entries({response_type:'code',client_id:this.config.clientId,redirect_uri:redirectUri,scope:scopes.join(' '),state,code_challenge:challenge(verifier),code_challenge_method:'S256'})) url.searchParams.set(k,v);
    return {url:url.href,verifier,scopes,redirectUri};
  }
  async tokenRequest(fields, requestedScopes=[]) {
    const headers={'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'};
    const body=new URLSearchParams({...fields,client_id:this.config.clientId});
    // TIDAL client credentials uses confidential Basic authentication. User flows use
    // client_id + PKCE (and the registered secret when operating a confidential client).
    if (this.config.clientSecret) headers.Authorization='Basic '+Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
    let response;
    try { response=await this.fetchImpl(TIDAL_TOKEN_URL,{method:'POST',headers,body,signal:AbortSignal.timeout(15000),redirect:'error'}); }
    catch { fail('TIDAL_AUTH_UNAVAILABLE','TIDAL authorization could not be reached. Reconnect before retrying an uncertain login exchange.',502); }
    const value=jsonText(await readLimited(response,65536));
    if (!response.ok) {
      const invalid=value?.error==='invalid_grant';
      fail(invalid?'TIDAL_RECONNECT_REQUIRED':'TIDAL_AUTH_FAILED', invalid?'TIDAL authorization expired or was revoked. Reconnect your account.':'TIDAL rejected the authorization request; check developer credentials and approved scopes.',invalid?401:502);
    }
    if (!value || typeof value.access_token!=='string' || value.access_token.length>16384 || !Number.isFinite(value.expires_in) || value.expires_in<=0 || (value.token_type && value.token_type.toLowerCase()!=='bearer')) fail('TIDAL_TOKEN_INVALID','TIDAL returned an invalid token response.',502);
    if (value.scope !== undefined && typeof value.scope !== 'string') fail('TIDAL_TOKEN_INVALID','TIDAL returned invalid scope metadata.',502);
    return {accessToken:value.access_token,refreshToken:typeof value.refresh_token==='string'?value.refresh_token:undefined,expiresAt:this.now()+value.expires_in*1000,scopes:value.scope===undefined?[...requestedScopes]:value.scope.split(/\s+/).filter(Boolean)};
  }
  async exchange(code, verifier, redirectUri, requestedScopes) {
    return this.tokenRequest({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirectUri},requestedScopes);
  }
  async identify(token) {
    let response;
    try { response=await this.fetchImpl(TIDAL_API+'/users/me',{headers:{Authorization:`Bearer ${token.accessToken}`,Accept:'application/vnd.api+json'},signal:AbortSignal.timeout(15000),redirect:'error'}); }
    catch { fail('TIDAL_AUTH_UNAVAILABLE','Could not verify the authenticated TIDAL account.',502); }
    if (!response.ok) fail('TIDAL_IDENTITY_FAILED','TIDAL identity verification failed. Ensure user.read was granted.',401);
    const doc=jsonText(await readLimited(response,65536));
    if (!doc?.data || doc.data.type!=='users' || typeof doc.data.id!=='string' || !doc.data.id || doc.data.id.length>256) fail('TIDAL_IDENTITY_FAILED','TIDAL did not return a valid user identity.',502);
    return {subject:doc.data.id,country:typeof doc.data.attributes?.countryCode==='string'?doc.data.attributes.countryCode:undefined};
  }
  saveGrant(token, identity) {
    const id=opaque();
    this.store.tx(s=>{s.grants[id]={id,subject:identity.subject,country:identity.country,token,createdAt:this.now(),disabled:false};});
    return id;
  }
  grant(id) { return id?this.store.read(s=>s.grants[id]):undefined; }
  async userToken(grantId, force=false, rejectedToken=undefined) {
    if (this.inflight.has(grantId)) return this.inflight.get(grantId);
    const grant=this.grant(grantId);
    if (!grant || grant.disabled) fail('TIDAL_RECONNECT_REQUIRED','Connect a TIDAL account before accessing private music data.',401);
    // A concurrent request may already have refreshed the rejected token.
    if (rejectedToken && grant.token.accessToken!==rejectedToken) return grant.token.accessToken;
    if (!force && grant.token.expiresAt>this.now()+30000) return grant.token.accessToken;
    if (!grant.token.refreshToken) fail('TIDAL_RECONNECT_REQUIRED','TIDAL token expired and no refresh token is available. Reconnect.',401);
    const job=(async()=>{
      try {
        const next=await this.tokenRequest({grant_type:'refresh_token',refresh_token:grant.token.refreshToken},grant.token.scopes);
        if (!next.refreshToken) next.refreshToken=grant.token.refreshToken;
        // A late refresh MUST NOT resurrect a disconnected grant.
        this.store.tx(s=>{if (!s.grants[grantId] || s.grants[grantId].disabled) fail('TIDAL_RECONNECT_REQUIRED','This account was disconnected.',401);s.grants[grantId].token=next;});
        return next.accessToken;
      } catch (error) {
        if (error instanceof AppError && error.code==='TIDAL_RECONNECT_REQUIRED') this.store.tx(s=>{if(s.grants[grantId]){s.grants[grantId].disabled=true;s.grants[grantId].token={scopes:[]};}});
        throw error;
      } finally { this.inflight.delete(grantId); }
    })();
    this.inflight.set(grantId,job);return job;
  }
  async clientToken(force=false,rejectedToken=undefined) {
    if (this.inflight.has('client')) return this.inflight.get('client');
    if (rejectedToken && this.appToken?.accessToken!==rejectedToken && this.appToken) return this.appToken.accessToken;
    if (!force && this.appToken?.expiresAt>this.now()+30000) return this.appToken.accessToken;
    if (!this.config.clientSecret) fail('TIDAL_AUTH_REQUIRED','Client-secret catalogue access is not configured. Link a TIDAL account instead.',401);
    const job=(async()=>{try{this.appToken=await this.tokenRequest({grant_type:'client_credentials'});return this.appToken.accessToken;}finally{this.inflight.delete('client');}})();
    this.inflight.set('client',job);return job;
  }
  disconnect(grantId) {
    this.store.tx(s=>{
      if(s.grants[grantId]) delete s.grants[grantId];
      for (const [k,v] of Object.entries(s.access)) if(v.grantId===grantId) delete s.access[k];
      for (const v of Object.values(s.families)) if(v.grantId===grantId) v.revoked=true;
      for (const [k,v] of Object.entries(s.plans)) if(v.grantId===grantId) delete s.plans[k];
      for (const [k,v] of Object.entries(s.profiles)) if(v===grantId) delete s.profiles[k];
    });
  }
}
