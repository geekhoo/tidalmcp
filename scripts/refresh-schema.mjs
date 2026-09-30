/** Fetch, inventory and archive the official API schema. NEVER auto-enable a new tool. */
import fs from 'node:fs';
import { sha256, readLimited } from '../src/core/util.mjs';
const url='https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json';
const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`Official schema download failed (${response.status})`);
const text=await readLimited(response,30*1024*1024),schema=JSON.parse(text);
if(!schema.openapi||!schema.paths||!schema.components)throw new Error('Not an OpenAPI schema.');
const deref=value=>{const seen=new Set();while(value?.$ref){if(seen.has(value.$ref)||!value.$ref.startsWith('#/'))return value;seen.add(value.$ref);value=value.$ref.slice(2).split('/').reduce((v,k)=>v?.[k.replaceAll('~1','/').replaceAll('~0','~')],schema);}return value;};
const methods=['get','post','put','patch','delete','head','options'],operations=[];
for(const[path,item]of Object.entries(schema.paths))for(const method of methods){const op=deref(item[method]);if(!op)continue;const tier=op['x-path-item-properties']?.['required-access-tier']||item['x-path-item-properties']?.['required-access-tier']||'UNSPECIFIED';operations.push({method:method.toUpperCase(),path,operationId:op.operationId,summary:op.summary,tier,deprecated:op.deprecated===true,security:op.security??schema.security??[],parameters:[...(item.parameters||[]),...(op.parameters||[])].map(deref),requestBody:deref(op.requestBody),responses:Object.fromEntries(Object.entries(op.responses||{}).map(([k,v])=>[k,deref(v)]))});}
const directory=new URL('../docs/upstream/',import.meta.url);fs.mkdirSync(directory,{recursive:true});
fs.writeFileSync(new URL('tidal-api-oas.json',directory),text);
const manifest={retrievedAt:new Date().toISOString(),url,sha256:sha256(text),openapi:schema.openapi,version:schema.info?.version,operationCount:operations.length,scopeDefinitions:schema.components.securitySchemes,operations};
fs.writeFileSync(new URL('inventory.json',directory),JSON.stringify(manifest,null,2)+'\n');
const approved=JSON.parse(fs.readFileSync(new URL('../docs/endpoint-allowlist.json',import.meta.url),'utf8')).operations;
const drift=approved.map(a=>{const o=operations.find(o=>o.path===a.path&&o.method===a.method);return {method:a.method,path:a.path,exists:!!o,tier:o?.tier,deprecated:o?.deprecated,needsReview:!o||o.tier!=='THIRD_PARTY'||o.deprecated};});
fs.writeFileSync(new URL('allowlist-drift.json',directory),JSON.stringify({version:schema.info?.version,checks:drift},null,2)+'\n');
fs.writeFileSync(new URL('ENDPOINT_INVENTORY.md',directory),'# Complete downloaded operation inventory\n\nSource: '+url+'\n\nVersion: '+schema.info?.version+'; SHA-256: `'+sha256(text)+'`. This inventory does not authorize access or enable endpoints.\n\n| Method | Path | Tier | Deprecated |\n|---|---|---|---|\n'+operations.map(o=>`| ${o.method} | \`${o.path}\` | ${o.tier} | ${o.deprecated} |`).join('\n')+'\n');
console.log(JSON.stringify({version:schema.info?.version,operations:operations.length,driftRequiresReview:drift.filter(x=>x.needsReview).length},null,2));
