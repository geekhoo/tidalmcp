import fs from 'node:fs';
import { verifyAudit } from '../src/core/audit.mjs';
if(!process.argv[2]){console.error('Usage: npm run audit:verify -- /path/to/audit.jsonl');process.exit(2);}
try{const result=verifyAudit(fs.readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(result,null,2));process.exitCode=result.valid?0:1;}catch{console.error('Audit file is missing, unreadable or malformed.');process.exitCode=1;}
