import { TOOLS, KINDS, COLLECTIONS, RELATIONS } from './contracts.mjs';
import { validate } from './schema.mjs';
import { fail, publicError, opaque, sha256, idSegment } from './util.mjs';
import { normalize, nextCursor } from './tidal-client.mjs';
export class TidalService {
  constructor({client,auth,plans,config,audit}){Object.assign(this,{client,auth,plans,config,audit});}
  status(principal) {
    const grant=this.auth.grant(principal?.grantId);
    return {connected:!!grant&&!grant.disabled,upstreamScopes:grant?.token.scopes||[],mcpScopes:principal?.scopes||[],writesEnabled:this.config.enableWrites,mode:principal?.local?'local-stdio':'remote-oauth',reconnect:principal?.local?'Run npm run login with the server stopped, then restart the stdio client.':'Reconnect this server through your MCP client’s OAuth connection settings.'};
  }
  async page(principal,path,query,scope) {
    const result=await this.client.request({principal,path,query,scope});
    const cursor=nextCursor(result.document,path);
    return {items:normalize(result.document),document:result.document,...(cursor?{nextCursor:cursor}:{}),...(result.document?.links?.next&&!cursor?{paginationWarning:'The upstream next link was not safe for this exact route; it was not followed.'}:{}),status:result.status};
  }
  async invoke(name,args,principal) {
    const requestId=opaque(12),start=Date.now(),definition=TOOLS.find(t=>t.name===name);
    let errorCode;
    try {
      if(!definition)fail('UNKNOWN_TOOL','Unsupported tool.',404);
      validate(definition.inputSchema,args);
      if(!principal?.scopes?.includes('tidal:read'))fail('MCP_READ_SCOPE_REQUIRED','tidal:read is required.',403);
      if(definition.private && !this.auth.grant(principal.grantId))fail('TIDAL_RECONNECT_REQUIRED','Link your TIDAL account before using this operation.',401);
      const country=args.countryCode || this.auth.grant(principal?.grantId)?.country || this.config.country;
      let data;
      switch(name) {
        case 'tidal_capabilities':data={tools:TOOLS.map(t=>({name:t.name,description:t.description})),entityKinds:KINDS,relations:RELATIONS,connection:this.status(principal),protocol:'official MCP SDK v2; stdio and Streamable HTTP; optional MCP Apps UI',apiSchemaVersion:'1.10.91',limitations:['Only explicitly allowlisted third-party TIDAL operations.','No audio downloads, DRM bypass, lyrics, device-code login or remote playback control.','Open-in-TIDAL links launch TIDAL; they do not confirm playback.','UI requires host MCP Apps support; non-UI clients retain all tools.','No claim of compatibility with agents that do not implement MCP.']};break;
        case 'tidal_auth_status':data=this.status(principal);break;
        case 'tidal_search':{
          const path=`/searchResults/${idSegment(args.query)}/relationships/${args.kind}`;
          const include={tracks:'tracks,tracks.artists,tracks.albums.coverArt',albums:'albums,albums.artists,albums.coverArt',artists:'artists,artists.profileArt',playlists:'playlists,playlists.coverArt',videos:'videos, videos.artists'.replace(' ','')}[args.kind];
          data=await this.page(principal,path,{countryCode:country,explicitFilter:args.explicitFilter||'INCLUDE',include,'page[cursor]':args.cursor},this.config.clientSecret?undefined:'search.read');break;
        }
        case 'tidal_get':{
          const include={tracks:'artists,albums,albums.coverArt',albums:'artists,coverArt',artists:'profileArt',playlists:'coverArt',videos:'artists'}[args.kind];
          data=await this.page(principal,`/${args.kind}/${idSegment(args.id)}`,{countryCode:country,include},args.kind==='playlists'&&principal.grantId?'playlists.read':undefined);break;
        }
        case 'tidal_related':{
          if(!RELATIONS[args.kind]?.includes(args.relation))fail('RELATION_NOT_SUPPORTED','That relationship is not allowlisted for this resource.');
          if(args.relation==='coverArt' && args.cursor)fail('INVALID_ARGUMENT','This to-one relationship has no pagination cursor.');
          data=await this.page(principal,`/${args.kind}/${idSegment(args.id)}/relationships/${args.relation}`,{countryCode:country,include:args.relation,'page[cursor]':args.cursor},args.kind==='playlists'&&principal.grantId?'playlists.read':undefined);break;
        }
        case 'tidal_get_me':data=await this.page(principal,'/users/me',{},'user.read');break;
        case 'tidal_list_playlists':data=await this.page(principal,'/playlists',{'filter[owners.id]':'me',countryCode:country,include:'coverArt',sort:args.sort||'-lastModifiedAt','page[cursor]':args.cursor},'playlists.read');break;
        case 'tidal_list_collection':data=await this.page(principal,`/${COLLECTIONS[args.kind]}/me/relationships/items`,{include:'items',locale:args.locale||'en-US','page[cursor]':args.cursor},'collection.read');break;
        case 'tidal_prepare_change':data=await this.plans.prepare(principal,args.change);break;
        case 'tidal_commit_change':data=await this.plans.commit(principal,args.planId,args.digest,args.confirm);break;
        case 'tidal_cancel_change':data=this.plans.cancel(principal,args.planId);break;
        case 'tidal_disconnect':this.auth.disconnect(principal.grantId);data={disconnected:true,tidalGrantRevoked:false,message:'This connection’s local tokens and MCP access were removed. Manage the TIDAL-side grant in your TIDAL account settings.'};break;
      }
      // Preserve the originating read operation so a host-rendered first page can paginate.
      if(Array.isArray(data?.items))data.source={tool:name,arguments:structuredClone(args)};
      return {ok:true,requestId,data};
    }catch(error){errorCode=error.code||'INTERNAL_ERROR';return {ok:false,requestId,error:publicError(error)};}
    finally{this.audit?.write({event:'tool.invoke',requestId,principalHash:sha256(principal?.grantId||principal?.subject||'anonymous'),tool:definition?.name||'unknown',status:errorCode?'error':'ok',durationMs:Date.now()-start,...(errorCode?{errorCode}:{})});}
  }
}
