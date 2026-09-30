import { fail, opaque, canonical, sha256, equalSecret, idSegment } from './util.mjs';
import { compileChange } from './contracts.mjs';
export class Plans {
  constructor({store,client,auth,config,now=Date.now}){Object.assign(this,{store,client,auth,config,now});}
  authorize(principal,scope) {
    if(!this.config.enableWrites)fail('WRITES_DISABLED','The operator has disabled writes. Set ENABLE_WRITES=true and reconnect with write permissions.',403);
    if(!principal?.grantId||!principal.scopes.includes('tidal:write'))fail('MCP_WRITE_SCOPE_REQUIRED','This MCP client has not been granted tidal:write.',403);
    const grant=this.auth.grant(principal.grantId);
    if(!grant||grant.disabled)fail('TIDAL_RECONNECT_REQUIRED','The TIDAL account is disconnected.',401);
    if(scope&&!grant.token.scopes.includes(scope))fail('TIDAL_SCOPE_REQUIRED',`Reconnect with ${scope}.`,403);
  }
  async prepare(principal,change) {
    if(change.playlistId)idSegment(change.playlistId);
    for(const item of change.items||[]){idSegment(item.id);if(item.itemId)idSegment(item.itemId);}
    for(const id of change.ids||[])idSegment(id);
    if(change.positionBefore)idSegment(change.positionBefore);
    if(change.ids && new Set(change.ids).size!==change.ids.length)fail('DUPLICATE_IDS','A collection change must not contain duplicate IDs.');
    if(change.action==='update_playlist'&&!['name','description','accessType'].some(k=>Object.hasOwn(change,k)))fail('EMPTY_CHANGE','Supply at least one playlist attribute to update.');
    const request=compileChange(change);this.authorize(principal,request.scope);
    let guard;
    if(change.playlistId){
      const current=await this.client.request({principal,path:`/playlists/${idSegment(change.playlistId)}`,scope:'playlists.read'});
      const a=current.document?.data?.attributes;
      if(!a)fail('PLAYLIST_UNAVAILABLE','Cannot prepare changes without reading the target playlist.',404);
      guard={path:`/playlists/${idSegment(change.playlistId)}`,name:a.name||'',...(a.lastModifiedAt?{lastModifiedAt:a.lastModifiedAt}:{})};
    }
    const planId=opaque(24),expiresAt=this.now()+300000;
    const exact={action:change.action,...request,...(guard?{guard}:{})};
    const digest=sha256(canonical(exact));
    this.store.tx(s=>{
      const own=Object.values(s.plans).filter(p=>p.grantId===principal.grantId&&p.expiresAt>this.now());
      if(own.length>=100)fail('PLAN_LIMIT','Too many active previews. Cancel unused previews or wait for expiry.',429);
      s.plans[planId]={...exact,planId,digest,grantId:principal.grantId,clientId:principal.clientId,expiresAt,createdAt:this.now(),idempotencyKey:opaque(24),status:'prepared'};
    });
    return {planId,digest,expiresAt:new Date(expiresAt).toISOString(),...exact,warning:'Review the exact target, access type and payload. Confirmation is enforced by the host and user interaction; a boolean is not proof of a human gesture. Preflight checks are not an atomic lock against changes made in another client.'};
  }
  own(principal,id) {
    const plan=this.store.read(s=>s.plans[id]);
    if(!plan||plan.grantId!==principal?.grantId||plan.clientId!==principal.clientId)fail('PLAN_NOT_FOUND','No preview belongs to this client and account.',404);
    return plan;
  }
  async commit(principal,id,digest,confirmed) {
    const plan=this.own(principal,id);this.authorize(principal,plan.scope);
    if(!confirmed||!equalSecret(plan.digest,digest))fail('CONFIRMATION_REQUIRED','Explicit approval of this exact preview digest is required.');
    if(plan.status==='completed')return {...plan.result,replayed:true};
    if(plan.status==='executing')fail('PLAN_BUSY','This preview is already executing; do not issue a parallel write.',409);
    if(['cancelled','failed'].includes(plan.status))fail('PLAN_CLOSED','This preview was cancelled or failed. Read current state and prepare a new preview.',409);
    if(plan.status==='unknown' && plan.retryUntil<=this.now())fail('WRITE_OUTCOME_UNKNOWN','Retry window expired. Inspect TIDAL before preparing any replacement operation.',409);
    if(plan.status==='prepared' && plan.expiresAt<=this.now())fail('PLAN_EXPIRED','Preview expired. Prepare and review it again.',409);
    const wasUnknown=plan.status==='unknown';
    this.store.tx(s=>{s.plans[id].status='executing';s.plans[id].retryUntil=plan.retryUntil||this.now()+55*60000;});
    let writeStarted=false;
    try {
      // Do not reject a retry merely because the original (uncertain) write changed the target.
      if(plan.guard&&!wasUnknown){
        const current=await this.client.request({principal,path:plan.guard.path,scope:'playlists.read'}),a=current.document?.data?.attributes;
        if(!a||a.name!==plan.guard.name||(plan.guard.lastModifiedAt&&a.lastModifiedAt!==plan.guard.lastModifiedAt))fail('STALE_PLAN','Playlist changed since preview. Read it again and prepare a fresh change.',409);
      }
      writeStarted=true;
      const result=await this.client.request({principal,path:plan.path,method:plan.method,body:plan.body,scope:plan.scope,idempotencyKey:plan.idempotencyKey});
      const output={applied:true,action:plan.action,status:result.status,document:result.document,partial:Array.isArray(result.document?.meta?.skippedItems)&&result.document.meta.skippedItems.length>0,warning:'Check skippedItems and returned relationship metadata; a successful HTTP status need not mean every requested item was added.'};
      this.store.tx(s=>{if(!s.plans[id])return;s.plans[id].status='completed';s.plans[id].result=output;});
      return output;
    }catch(error){
      // Once a write starts, network, parser, persistence or server failures can be ambiguous.
      const uncertain=writeStarted && (!error.status || error.status>=500 || ['WRITE_OUTCOME_UNKNOWN','TIDAL_CONFLICT','TIDAL_RATE_LIMITED'].includes(error.code));
      this.store.tx(s=>{if(s.plans[id])s.plans[id].status=uncertain?'unknown':'failed';});
      throw error;
    }
  }
  cancel(principal,id) {
    const plan=this.own(principal,id);
    if(['executing','completed','unknown'].includes(plan.status))fail('CANNOT_CANCEL','Cannot cancel an executing, completed or uncertain write; inspect its outcome.',409);
    this.store.tx(s=>{s.plans[id].status='cancelled';});return {cancelled:true,planId:id};
  }
}
