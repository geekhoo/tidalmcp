import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from '../src/core/util.mjs';
const root=new URL('../',import.meta.url);
export function flattenTokens(tree,prefix='',output={}) {
  if(tree && typeof tree==='object' && Object.hasOwn(tree,'$value')){output[prefix]=tree.$value;return output;}
  for(const[k,v]of Object.entries(tree||{}))if(!k.startsWith('$'))flattenTokens(v,prefix?`${prefix}.${k}`:k,output);
  return output;
}
export function resolveTokens(values) {
  const resolved={};
  const resolve=(key,stack=[])=>{
    if(Object.hasOwn(resolved,key))return resolved[key];
    if(!Object.hasOwn(values,key))throw new Error(`Unknown token reference: ${key}`);
    if(stack.includes(key))throw new Error(`Cyclic token reference: ${[...stack,key].join(' -> ')}`);
    const original=values[key];
    const value=Array.isArray(original)&&original.length===4&&original.every(Number.isFinite)?`cubic-bezier(${original.join(', ')})`:original;
    if(typeof value!=='string'&&typeof value!=='number')throw new Error(`Unsupported non-scalar token: ${key}`);
    resolved[key]=typeof value==='string'?value.replace(/\{([^}]+)\}/g,(_,reference)=>String(resolve(reference,[...stack,key]))):value;
    return resolved[key];
  };
  for(const key of Object.keys(values))resolve(key);
  return resolved;
}
export const cssName=key=>'--'+key.replaceAll('.','-').replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
export function generateTokens() {
  const files=['primitive/base.tokens.json','semantic/base.tokens.json','semantic/layout.tokens.json','component/button.tokens.json'];
  const raw={},sources=[];
  for(const name of files){const file=new URL('design-source/design/tokens/'+name,root),text=fs.readFileSync(file,'utf8');sources.push({path:'design-source/design/tokens/'+name,sha256:sha256(text)});flattenTokens(JSON.parse(text),'',raw);}
  const resolved=resolveTokens(raw),lines=Object.keys(resolved).sort().map(k=>`  ${cssName(k)}: ${resolved[k]};`);
  fs.mkdirSync(new URL('web/',root),{recursive:true});fs.mkdirSync(new URL('audit/',root),{recursive:true});
  fs.writeFileSync(new URL('web/tokens.css',root),'/* Generated from supplied design.zip. Never edit this file by hand. */\n:root {\n'+lines.join('\n')+'\n}\n');
  fs.writeFileSync(new URL('audit/design-token-map.json',root),JSON.stringify({sources,theme:'light',darkDraft:'Preserved, not activated: the source draft does not define a complete accessible dark palette.',count:Object.keys(resolved).length,tokens:Object.keys(resolved).sort().map(key=>({key,css:cssName(key),original:raw[key],resolved:resolved[key]}))},null,2)+'\n');
  return resolved;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const out=generateTokens();console.log(`Generated ${Object.keys(out).length} design token variables.`);}
