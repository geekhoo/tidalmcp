import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);}
const files=['src','scripts','web','tests'].flatMap(d=>walk(path.join(root,d))).filter(f=>f.endsWith('.mjs'));
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){console.error(result.stderr);process.exit(1);}}
const css=fs.readFileSync(path.join(root,'web/tokens.css'),'utf8')+fs.readFileSync(path.join(root,'web/style.css'),'utf8');
const definitions=new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]));
for(const[,reference]of css.matchAll(/var\((--[\w-]+)/g))if(!definitions.has(reference))throw new Error(`Undefined CSS variable ${reference}`);
console.log(`Syntax checked ${files.length} JavaScript modules; all referenced CSS variables are defined. This does not import or type-check external SDKs.`);
