import fs from 'node:fs';
import { TOOLS, RELATIONS, COLLECTIONS } from '../src/core/contracts.mjs';
fs.mkdirSync(new URL('../docs/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../docs/tools.json',import.meta.url),JSON.stringify({version:1,tools:TOOLS},null,2)+'\n');
const lines=['# Tool reference','','Generated from `src/core/contracts.mjs`. Inputs are strict: unknown fields are rejected. All tools return the envelope described in DATA_CONTRACTS.md. Remote access requires MCP OAuth; stdio trusts the local process boundary.','','| Tool | Purpose | Account required | UI |','|---|---|---|---|',...TOOLS.map(t=>`| \`${t.name}\` | ${t.description} | ${t.private?'Yes':'Not for client-credentials catalogue reads'} | ${t.ui?'Optional':'Text/JSON'} |`),'','## Input schemas','','The following are the authoritative application input contracts; the adapter converts the same descriptors into Zod schemas for the official MCP SDK.',''];
for(const t of TOOLS)lines.push('### '+t.name,'','```json',JSON.stringify(t.inputSchema,null,2),'```','');
fs.writeFileSync(new URL('../docs/TOOL_REFERENCE.md',import.meta.url),lines.join('\n'));
const selected=[];const add=(method,path,scope,tool)=>selected.push({method,path,scope,tool,status:'implemented_allowlist',tier:'THIRD_PARTY',evidence:'Official published OpenAPI inspected 2026-09-30; refresh script provides full machine inventory.'});
add('GET','/searchResults','client credentials or search.read','tidal_search');
for(const k of ['tracks','albums','artists','playlists','videos']){add('GET',`/searchResults/{id}/relationships/${k}`,'client credentials or search.read','tidal_search');add('GET',`/${k}/{id}`,'catalogue; playlists.read for linked account playlists','tidal_get');}
for(const[k,rels]of Object.entries(RELATIONS))for(const rel of rels)add('GET',`/${k}/{id}/relationships/${rel}`,k==='playlists'?'playlists.read':'catalogue','tidal_related');
add('GET','/users/{id}','user.read','tidal_get_me');add('GET','/playlists','playlists.read','tidal_list_playlists');
for(const resource of Object.values(COLLECTIONS))for(const method of ['GET','POST','DELETE'])add(method,`/${resource}/{id}/relationships/items`,method==='GET'?'collection.read':'collection.write',method==='GET'?'tidal_list_collection':'tidal_prepare_change → tidal_commit_change');
add('POST','/playlists','playlists.write','create_playlist');for(const m of ['PATCH','DELETE'])add(m,'/playlists/{id}','playlists.write',m==='PATCH'?'update_playlist':'delete_playlist');for(const m of ['POST','DELETE','PATCH'])add(m,'/playlists/{id}/relationships/items','playlists.write','playlist item changes');
fs.writeFileSync(new URL('../docs/endpoint-allowlist.json',import.meta.url),JSON.stringify({schemaVersion:'1.10.91',source:'https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json',coverage:'Curated implemented operations, NOT a complete published OpenAPI snapshot.',count:selected.length,operations:selected},null,2)+'\n');
console.log(`Generated ${TOOLS.length} tool contracts and ${selected.length} selected method/path bindings.`);
