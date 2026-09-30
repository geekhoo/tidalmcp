import fs from 'node:fs';
import { sha256 } from '../src/core/util.mjs';
const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('audit/source-manifest.json',root),'utf8'));
let failures=0;for(const record of manifest.files){try{if(sha256(fs.readFileSync(new URL(record.path,root)))!==record.sha256){console.error('Changed: '+record.path);failures++;}}catch{console.error('Missing: '+record.path);failures++;}}
console.log(`${manifest.files.length} delivered files checked; ${failures} mismatches. Running tests may intentionally replace audit outputs.`);process.exitCode=failures?1:0;
