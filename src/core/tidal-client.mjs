import { fail, readLimited, jsonText, retryDelay, sleep, safeArtwork, safeLink } from './util.mjs';
import { TIDAL_API } from './upstream-auth.mjs';
export async function nativeSend({method,path,query,token,body,idempotencyKey,signal}, fetchImpl=fetch) {
  const url=new URL(TIDAL_API+path);
  for(const [k,v] of Object.entries(query||{})) if(v!==undefined) url.searchParams.set(k,String(v));
  const headers={Accept:'application/vnd.api+json',Authorization:`Bearer ${token}`};
  if(body!==undefined)headers['Content-Type']='application/vnd.api+json';
  if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
  return fetchImpl(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal,redirect:'error'});
}
export class TidalClient {
  constructor({auth,send=nativeSend,delay=sleep,now=Date.now}) {Object.assign(this,{auth,send,delay,now});}
  async request({principal,path,method='GET',query={},body,scope,idempotencyKey}) {
    if(!/^\/[A-Za-z][A-Za-z0-9]*(?:\/[^?#]*)?$/.test(path) || path.includes('://') || /(?:^|\/)\.\.(?:\/|$)/.test(path)) fail('INVALID_ROUTE','The requested route is not allowed.');
    const user=!!scope || !this.auth.config.clientSecret;
    const grantId=principal?.grantId;
    if(user) {
      const grant=this.auth.grant(grantId);
      if(!grant || grant.disabled)fail('TIDAL_RECONNECT_REQUIRED','Link your TIDAL account to use this operation.',401);
      if(scope && !grant.token.scopes.includes(scope))fail('TIDAL_SCOPE_REQUIRED',`Reconnect with the ${scope} permission.`,403,{scope});
    }
    const tokenFn=(force=false,previous)=>user?this.auth.userToken(grantId,force,previous):this.auth.clientToken(force,previous);
    let token=await tokenFn(), refreshed=false, retries=0;
    while(true) {
      let response;
      try {response=await this.send({method,path,query,token,body,idempotencyKey,signal:AbortSignal.timeout(15000)});}
      catch(error) {
        if(error?.code==='RESPONSE_TOO_LARGE')throw error;
        if(method==='GET' && retries++<2){await this.delay(200*2**retries);continue;}
        fail(method==='GET'?'TIDAL_UNAVAILABLE':'WRITE_OUTCOME_UNKNOWN',method==='GET'?'TIDAL could not be reached.':'The write may have reached TIDAL. Retry only this same plan within its retry window; do not create a replacement plan.',502);
      }
      if(response.status===401 && method==='GET' && !refreshed) {await response.body?.cancel();refreshed=true;token=await tokenFn(true,token);continue;}
      if(method==='GET' && (response.status===429 || response.status>=500) && retries++<2) {const wait=retryDelay(response.headers.get('retry-after'),this.now());await response.body?.cancel();await this.delay(wait+retries*100);continue;}
      const raw=await readLimited(response);const document=raw?jsonText(raw):null;
      if(!response.ok) {
        const code=({400:'TIDAL_BAD_REQUEST',401:'TIDAL_RECONNECT_REQUIRED',403:'TIDAL_FORBIDDEN',404:'TIDAL_NOT_FOUND',409:'TIDAL_CONFLICT',422:'TIDAL_UNPROCESSABLE',429:'TIDAL_RATE_LIMITED'})[response.status] || (method==='GET'?'TIDAL_UPSTREAM_ERROR':'WRITE_OUTCOME_UNKNOWN');
        const messages={TIDAL_BAD_REQUEST:'TIDAL rejected a parameter or payload. Check the pinned API contract.',TIDAL_RECONNECT_REQUIRED:'TIDAL authorization was rejected. Reconnect before continuing.',TIDAL_FORBIDDEN:'TIDAL denied this action. Scope, subscription, country or app-tier access may be required.',TIDAL_NOT_FOUND:'Resource not found or not visible to this account.',TIDAL_CONFLICT:'TIDAL reported a conflict; inspect the current state before retrying.',TIDAL_UNPROCESSABLE:'TIDAL rejected this operation, possibly because an idempotency key was reused with a different payload.',TIDAL_RATE_LIMITED:'TIDAL rate-limited the request. Retry later.',TIDAL_UPSTREAM_ERROR:'TIDAL returned a server error.',WRITE_OUTCOME_UNKNOWN:'TIDAL may have applied this write. Reuse only the same plan and key during its retry window.'};
        const safeCodes=Array.isArray(document?.errors)?document.errors.map(e=>e.code).filter(v=>typeof v==='string'&&/^[A-Z0-9_:-]{1,100}$/.test(v)).slice(0,8):[];
        fail(code,messages[code],response.status>=500?502:response.status,{upstreamStatus:response.status,...(safeCodes.length?{upstreamCodes:safeCodes}:{}),...(response.status===429?{retryAfterMs:retryDelay(response.headers.get('retry-after'),this.now())}:{})});
      }
      if(document!==null && (!document || typeof document!=='object' || (!Object.hasOwn(document,'data') && !Object.hasOwn(document,'meta')))) fail('TIDAL_RESPONSE_INVALID','TIDAL returned an unexpected document shape.',502);
      return {status:response.status,document};
    }
  }
}
export function nextCursor(document, expectedPath) {
  const next=document?.links?.next;const href=typeof next==='string'?next:next?.href;
  if(!href)return undefined;
  try {
    if(hasUnsafePathSyntax(href))return undefined;
    const api=new URL(TIDAL_API),apiPath=api.pathname.replace(/\/+$/,'');
    // TIDAL JSON:API links are relative to its /v2 API base, not the host root.
    let reference=href;
    if(href.startsWith('/')&&!href.startsWith('//')&&href!==apiPath&&!href.startsWith(`${apiPath}/`))reference=apiPath+href;
    const url=new URL(reference,href.startsWith('/')&&!href.startsWith('//')?api.origin+'/':TIDAL_API+expectedPath);
    if(url.origin!==api.origin || url.pathname!==new URL(TIDAL_API+expectedPath).pathname || url.username || url.password || url.hash) return undefined;
    const cursor=url.searchParams.get('page[cursor]');return cursor && cursor.length<=8192?cursor:undefined;
  }catch{return undefined;}
}
function hasUnsafePathSyntax(href) {
  let path=href;
  const absolute=href.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/);
  const network=href.match(/^\/\/[^/?#]*(\/[^?#]*)?/);
  if(absolute)path=absolute[1]||'';else if(network)path=network[1]||'';
  path=path.split(/[?#]/,1)[0];
  if(path.includes('\\'))return true;
  for(const segment of path.split('/')){const decoded=decodeURIComponent(segment);if(decoded==='.'||decoded==='..')return true;}
  return false;
}
/** Keep JSON:API raw document intact; normalize ONLY primary linkage for the view. */
export function normalize(document) {
  if(!document)return [];
  const data=Array.isArray(document.data)?document.data:document.data?[document.data]:[];
  const resources=new Map([...data,...(Array.isArray(document.included)?document.included:[])].filter(r=>r&&typeof r.type==='string'&&typeof r.id==='string').map(r=>[`${r.type}:${r.id}`,r]));
  const linked=(resource,key)=>{
    const d=resource.relationships?.[key]?.data;
    return (Array.isArray(d)?d:d?[d]:[]).map(r=>resources.get(`${r.type}:${r.id}`)||r);
  };
  return data.filter(r=>r&&typeof r.id==='string'&&typeof r.type==='string').map(link=>{
    const r=resources.get(`${link.type}:${link.id}`)||link, a=r.attributes||{};
    const album=linked(r,'albums')[0], art=linked(r,'coverArt')[0]||linked(r,'profileArt')[0]||(album&&linked(album,'coverArt')[0]);
    const files=art?.attributes?.files;const urls=Array.isArray(files)?files.map(f=>f.href||f.url):[];
    const imageUrl=urls.map(safeArtwork).find(Boolean);
    const singular={tracks:'track',albums:'album',artists:'artist',videos:'video',playlists:'playlist'}[r.type];
    const external=Array.isArray(a.externalLinks)?a.externalLinks.map(x=>safeLink(x.href||x.url)).find(Boolean):undefined;
    return {id:r.id,type:r.type,title:typeof(a.title||a.name)==='string'?(a.title||a.name):`${r.type} ${r.id}`,artists:linked(r,'artists').map(v=>v.attributes?.name).filter(x=>typeof x==='string'),...(a.duration?{duration:a.duration}:{}),explicit:a.explicit===true,...(imageUrl?{imageUrl}:{}),...(singular?{url:external||`https://tidal.com/browse/${singular}/${encodeURIComponent(r.id)}`}:{}) ,...(link.meta?{occurrence:link.meta}:{}),attributes:a};
  });
}
