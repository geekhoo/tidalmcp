import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../helpers/fixture.mjs';
const prepare=(f,change)=>f.service.invoke('tidal_prepare_change',{change},f.principal);
const commit=(f,plan)=>f.service.invoke('tidal_commit_change',{planId:plan.planId,digest:plan.digest,confirm:true},f.principal);
test('preparation never performs a TIDAL write; commit replays are idempotent',async()=>{
  const f=fixture(),p=await prepare(f,{action:'create_playlist',name:'New mix'});assert.equal(p.ok,true);assert.equal(f.fake.mutations,0);const a=await commit(f,p.data),b=await commit(f,p.data);assert.equal(a.ok,true);assert.equal(b.data.replayed,true);assert.equal(f.fake.mutations,1);
});
test('write needs operator opt-in, MCP write scope and upstream write scope',async()=>{
  for(const adjust of [f=>f.config.enableWrites=false,f=>f.principal.scopes=['tidal:read'],f=>f.store.tx(s=>s.grants[f.principal.grantId].token.scopes=['user.read'])]){const f=fixture();adjust(f);const r=await prepare(f,{action:'create_playlist',name:'x'});assert.equal(r.ok,false);assert.equal(f.fake.mutations,0);}
});
test('preview digest and confirm=true are mandatory',async()=>{
  const f=fixture(),p=await prepare(f,{action:'create_playlist',name:'x'});for(const args of [{planId:p.data.planId,digest:'f'.repeat(64),confirm:true},{planId:p.data.planId,digest:p.data.digest,confirm:false}]){const r=await f.service.invoke('tidal_commit_change',args,f.principal);assert.equal(r.ok,false);}assert.equal(f.fake.mutations,0);
});
test('another client or account cannot use a preview',async()=>{
  const f=fixture(),p=await prepare(f,{action:'create_playlist',name:'x'});await assert.rejects(f.plans.commit({...f.principal,clientId:'other'},p.data.planId,p.data.digest,true));await assert.rejects(f.plans.commit({...f.principal,grantId:'other'},p.data.planId,p.data.digest,true));assert.equal(f.fake.mutations,0);
});
test('expired and cancelled previews cannot execute',async()=>{
  let time=Date.now();const f=fixture({now:()=>time}),p=await prepare(f,{action:'create_playlist',name:'x'});time+=300001;assert.equal((await commit(f,p.data)).error.code,'PLAN_EXPIRED');const q=await prepare(f,{action:'create_playlist',name:'y'});f.plans.cancel(f.principal,q.data.planId);assert.equal((await commit(f,q.data)).error.code,'PLAN_CLOSED');
});
test('removing one duplicate preserves the other occurrence',async()=>{
  const f=fixture(),p=await prepare(f,{action:'remove_playlist_items',playlistId:'p1',items:[{type:'tracks',id:'t1',itemId:'occ3'}]});assert.equal(p.ok,true);const r=await commit(f,p.data);assert.equal(r.ok,true);assert.equal(r.data.status,204);assert.equal(f.fake.playlistItems.p1.some(i=>i.meta.itemId==='occ1'),true);assert.equal(f.fake.playlistItems.p1.some(i=>i.meta.itemId==='occ3'),false);
});
test('stale playlist preview is rejected before mutation',async()=>{
  const f=fixture(),p=await prepare(f,{action:'delete_playlist',playlistId:'p1'});f.fake.playlists[0].attributes.name='Changed in another client';const r=await commit(f,p.data);assert.equal(r.error.code,'STALE_PLAN');assert.equal(f.fake.mutations,0);
});
test('uncertain write retries the same idempotency key rather than duplicating',async()=>{
  const f=fixture(),p=await prepare(f,{action:'create_playlist',name:'One only'});f.fake.failAfterWrite=true;const a=await commit(f,p.data);assert.equal(a.error.code,'WRITE_OUTCOME_UNKNOWN');assert.equal(f.fake.mutations,1);const b=await commit(f,p.data);assert.equal(b.ok,true);assert.equal(f.fake.mutations,1);assert.equal(f.fake.playlists.filter(x=>x.attributes.name==='One only').length,1);const writes=f.fake.requests.filter(r=>r.method==='POST'&&r.path==='/v2/playlists');assert.equal(writes[0].headers['idempotency-key'],writes[1].headers['idempotency-key']);
});
test('concurrent commit is rejected while first is in flight',async()=>{
  const f=fixture(),p=await prepare(f,{action:'create_playlist',name:'x'});const original=f.client.request.bind(f.client);let release;f.client.request=async a=>{await new Promise(r=>release=r);return original(a);};const first=commit(f,p.data);const second=await commit(f,p.data);assert.equal(second.error.code,'PLAN_BUSY');release();assert.equal((await first).ok,true);assert.equal(f.fake.mutations,1);
});
test('all eight mutation actions compile and execute against contract fixture',async()=>{
  const f=fixture();for(const change of [{action:'create_playlist',name:'new'},{action:'update_playlist',playlistId:'p1',description:'edited'},{action:'add_playlist_items',playlistId:'p1',items:[{type:'tracks',id:'t3'}]},{action:'move_playlist_items',playlistId:'p1',items:[{type:'tracks',id:'t2',itemId:'occ2'}],positionBefore:'occ1'},{action:'remove_playlist_items',playlistId:'p1',items:[{type:'tracks',id:'t1',itemId:'occ3'}]},{action:'save_collection_items',kind:'tracks',ids:['t8']},{action:'remove_collection_items',kind:'tracks',ids:['t8']},{action:'delete_playlist',playlistId:'p2'}]){const p=await prepare(f,change);assert.equal(p.ok,true,JSON.stringify(p));const r=await commit(f,p.data);assert.equal(r.ok,true,JSON.stringify(r));}assert.equal(f.fake.mutations,8);
});
