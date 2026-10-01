import { MemoryStore } from '../../src/core/store.mjs';
import { Audit } from '../../src/core/audit.mjs';
import { UpstreamAuth, READ_SCOPES, WRITE_SCOPES } from '../../src/core/upstream-auth.mjs';
import { TidalClient, nativeSend } from '../../src/core/tidal-client.mjs';
import { OAuthBroker } from '../../src/core/oauth.mjs';
import { Plans } from '../../src/core/plans.mjs';
import { TidalService } from '../../src/core/service.mjs';
import { canonical } from '../../src/core/util.mjs';
export const testConfig={origin:'http://127.0.0.1:3000',resource:'http://127.0.0.1:3000/mcp',callback:'http://127.0.0.1:3000/tidal/callback',local:true,clientId:'synthetic-client',clientSecret:'synthetic-secret-not-a-live-credential',key:Buffer.alloc(32,7),dataDir:'unused',country:'SG',enableWrites:true,redirectAllowlist:['http://127.0.0.1:8766/callback'],allowedOrigins:[],profile:'local'};
const response=(status,data)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/vnd.api+json'}});
export class FakeTidal {
  constructor(){
    this.requests=[];this.mutations=0;this.refreshes=0;this.tokenCalls=0;this.failures=[];this.idempotency=new Map();this.tick=0;this.searches=new Map();this.searchCounter=0;this.searchNext=undefined;
    this.artists=[['a1','The Quiet Hours'],['a2','June Mercer'],['a3','Northbound'],['a4','Mono Bloom']].map(([id,name])=>({type:'artists',id,attributes:{name}}));
    this.albums=[{type:'albums',id:'al1',attributes:{title:'Night Studies'},relationships:{artists:{data:[{type:'artists',id:'a1'}]}}},{type:'albums',id:'al2',attributes:{title:'Rooms After Dark'},relationships:{artists:{data:[{type:'artists',id:'a2'}]}}}];
    const names=['Night Windows','The Last Train Home','Afterimage','Soft Focus','Late Check-out','A Kind of Blue Hour','Paper Lanterns','Before the City Wakes'];
    this.tracks=names.map((title,i)=>({type:'tracks',id:`t${i+1}`,attributes:{title,duration:`PT${3+i%3}M${String(12+i*4)}S`,explicit:i===4},relationships:{artists:{data:[{type:'artists',id:'a'+(i%4+1)}]},albums:{data:[{type:'albums',id:'al1'}]}}}));
    this.videos=[{type:'videos',id:'v1',attributes:{title:'Night Session',duration:'PT5M12S'},relationships:{artists:{data:[{type:'artists',id:'a1'}]}}}];
    this.playlists=[{type:'playlists',id:'p1',attributes:{name:'Night drive',description:'A fictional playlist for interface testing.',accessType:'UNLISTED',lastModifiedAt:'2026-09-30T00:00:00.000Z'}},{type:'playlists',id:'p2',attributes:{name:'Deep work',description:'A synthetic, not a real TIDAL playlist.',accessType:'UNLISTED',lastModifiedAt:'2026-09-30T00:00:00.000Z'}}];
    this.playlistItems={p1:[{type:'tracks',id:'t1',meta:{itemId:'occ1'}},{type:'tracks',id:'t2',meta:{itemId:'occ2'}},{type:'tracks',id:'t1',meta:{itemId:'occ3'}}],p2:[{type:'tracks',id:'t4',meta:{itemId:'occ4'}}]};
    this.collections={tracks:['t1','t4','t7'],albums:['al1'],artists:['a1'],playlists:['p1'],videos:['v1']};
  }
  all(){return [...this.tracks,...this.artists,...this.albums,...this.videos,...this.playlists];}
  doc(data,path='/v2/mock',extra={}){return {data,included:this.all(),links:{self:'https://openapi.tidal.com'+path},...extra};}
  queue(method,path,result){this.failures.push({method,path,result});}
  async fetch(input,init={}) {
    const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url),method=request.method;
    const text=await request.clone().text();const headers=Object.fromEntries(request.headers);
    this.requests.push({url:url.href,path:url.pathname,method,headers,body:text});
    const idx=this.failures.findIndex(v=>v.method===method&&v.path===url.pathname);
    if(idx>=0){const {result}=this.failures.splice(idx,1)[0];if(result instanceof Error)throw result;return result;}
    if(url.hostname==='auth.tidal.com'){
      this.tokenCalls++;const params=new URLSearchParams(text);if(params.get('grant_type')==='refresh_token')this.refreshes++;
      return new Response(JSON.stringify({access_token:`synthetic-access-${this.tokenCalls}`,token_type:'Bearer',expires_in:3600,...(params.get('grant_type')==='client_credentials'?{}:{refresh_token:`synthetic-refresh-${this.tokenCalls}`,scope:[...READ_SCOPES,...WRITE_SCOPES].join(' ')})}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(!request.headers.get('authorization')?.startsWith('Bearer '))return response(401,{errors:[{code:'UNAUTHORIZED'}]});
    const path=url.pathname.replace(/^\/v2/,''),parts=path.split('/').filter(Boolean).map(decodeURIComponent);
    if(path==='/users/me')return response(200,{data:{type:'users',id:'demo-user',attributes:{countryCode:'SG',name:'Demo listener'}}});
    if(method==='GET'){
      if(parts[0]==='searchResults'){
        if(parts.length===1){const query=url.searchParams.get('filter[query]');if(!query)return response(400,{errors:[{code:'FILTER_QUERY_REQUIRED'}]});const id=`search-${++this.searchCounter}`;this.searches.set(id,query.toLowerCase());return response(200,{data:[{type:'searchResults',id,attributes:{query}}]});}
        const kind=parts[3],query=this.searches.get(parts[1]);if(!query||!['tracks','albums','artists','playlists','videos'].includes(kind))return response(400,{errors:[{code:'INVALID_RESOURCE_ID'}]});
        const data=(this[kind]||[]).filter(r=>canonical(r).toLowerCase().includes(query)||query==='night'&&kind==='tracks');
        const extra=this.searchNext?{links:{next:this.searchNext}}:{};return response(200,this.doc(data.map(r=>({type:r.type,id:r.id})),url.pathname,extra));
      }
      if(parts[0].startsWith('userCollection')){
        const kind=parts[0].replace('userCollection','').toLowerCase();return response(200,this.doc((this.collections[kind]||[]).map(id=>({type:kind,id})),url.pathname));
      }
      const kind=parts[0],id=parts[1];
      if(!id)return response(200,this.doc(this[kind]||[],url.pathname));
      const resource=(this[kind]||[]).find(r=>r.id===id);if(!resource)return response(404,{errors:[{code:'NOT_FOUND'}]});
      if(parts[2]==='relationships'){
        if(kind==='artists'&&parts[3]==='tracks'&&!['FINGERPRINT','NONE'].includes(url.searchParams.get('collapseBy')))return response(400,{errors:[{code:'MISSING_REQUIRED_PARAMETER'}]});
        if(kind==='playlists'&&parts[3]==='items')return response(200,this.doc(this.playlistItems[id]||[],url.pathname));
        const related=parts[3]==='items'||parts[3]==='radio'||parts[3]==='similarTracks'?'tracks':parts[3];return response(200,this.doc(this[related]||[],url.pathname));
      }
      return response(200,this.doc(resource,url.pathname));
    }
    const key=request.headers.get('idempotency-key'),fingerprint=canonical({method,path,body:text});
    if(!key)return response(400,{errors:[{code:'IDEMPOTENCY_KEY_REQUIRED'}]});
    if(this.idempotency.has(key)){const hit=this.idempotency.get(key);if(hit.fingerprint!==fingerprint)return response(422,{errors:[{code:'IDEMPOTENCY_KEY_REUSED'}]});return response(hit.status,hit.data);}
    const body=text?JSON.parse(text):undefined;let status=200,data={data:null};
    if(parts[0]==='playlists'&&parts.length===1&&method==='POST'){
      if(body?.data?.type!=='playlists'||!body.data.attributes?.name)return response(400,{errors:[{code:'INVALID_PLAYLIST'}]});
      const item={type:'playlists',id:`p${this.playlists.length+1}`,attributes:{...body.data.attributes,lastModifiedAt:new Date(Date.now()+this.tick++).toISOString()}};this.playlists.push(item);this.playlistItems[item.id]=[];status=201;data={data:item};
    }else if(parts[0]==='playlists'&&parts.length===2){
      const item=this.playlists.find(p=>p.id===parts[1]);if(!item)return response(404,{errors:[{code:'NOT_FOUND'}]});
      if(method==='DELETE'){this.playlists=this.playlists.filter(p=>p!==item);delete this.playlistItems[item.id];status=204;data=null;}
      else{Object.assign(item.attributes,body.data.attributes);item.attributes.lastModifiedAt=new Date(Date.now()+this.tick++).toISOString();data={data:item};}
    }else if(parts[0]==='playlists'&&parts[3]==='items'){
      const id=parts[1],list=this.playlistItems[id];if(!list)return response(404,{errors:[{code:'NOT_FOUND'}]});
      if(method==='POST'){
        const items=body.data.map(r=>({...r,meta:{itemId:'new-occ-'+(++this.tick)}}));const at=body.meta?.positionBefore?list.findIndex(x=>x.meta.itemId===body.meta.positionBefore):list.length;
        list.splice(at<0?list.length:at,0,...items);data=this.doc(items);
      }else if(method==='DELETE'){
        if(body.data.some(x=>!x.meta?.itemId))return response(400,{errors:[{code:'ITEM_ID_REQUIRED'}]});
        this.playlistItems[id]=list.filter(x=>!body.data.some(y=>y.id===x.id&&y.type===x.type&&y.meta.itemId===x.meta.itemId));status=204;data=null;
      }else if(method==='PATCH'){
        const moving=list.filter(x=>body.data.some(y=>y.meta.itemId===x.meta.itemId)),rest=list.filter(x=>!moving.includes(x));let at=rest.findIndex(x=>x.meta.itemId===body.meta?.positionBefore);if(at<0)at=rest.length;rest.splice(at,0,...moving);this.playlistItems[id]=rest;data=this.doc(moving);
      }
      this.playlists.find(p=>p.id===id).attributes.lastModifiedAt=new Date(Date.now()+this.tick++).toISOString();
    }else if(parts[0].startsWith('userCollection')){
      const kind=parts[0].replace('userCollection','').toLowerCase(),ids=body.data.map(v=>v.id);
      this.collections[kind]=method==='POST'?[...new Set([...this.collections[kind],...ids])]:this.collections[kind].filter(id=>!ids.includes(id));data=this.doc(body.data);if(method==='DELETE'){status=204;data=null;}
    }else return response(404,{errors:[{code:'NOT_FOUND'}]});
    this.mutations++;this.idempotency.set(key,{fingerprint,status,data:structuredClone(data)});
    if(this.failAfterWrite){this.failAfterWrite=false;throw new Error('Synthetic connection reset after applying write.');}
    return response(status,data);
  }
}
export async function fixture(options={}) {
  const cfg={...testConfig,...options.config},store=new MemoryStore(),fake=options.fake||new FakeTidal(),now=options.now||Date.now;
  const auth=new UpstreamAuth({store,config:cfg,fetchImpl:options.fetchImpl||fake.fetch.bind(fake),now});
  const grantId=await auth.saveGrant({accessToken:'synthetic-initial-access',refreshToken:'synthetic-initial-refresh',expiresAt:now()+3600000,scopes:[...READ_SCOPES,...WRITE_SCOPES]},{subject:'demo-user',country:'SG'});
  const principal={grantId,subject:'demo-user',clientId:'synthetic-agent',scopes:['tidal:read','tidal:write'],local:true};
  const client=new TidalClient({auth,send:options.send||(request=>nativeSend(request,options.fetchImpl||fake.fetch.bind(fake))),delay:async()=>{},now}),plans=new Plans({store,client,auth,config:cfg,now}),audit=new Audit(),service=new TidalService({client,auth,plans,config:cfg,audit}),broker=new OAuthBroker({store,auth,config:cfg,now});
  return {config:cfg,store,fake,auth,principal,client,plans,audit,service,broker};
}
