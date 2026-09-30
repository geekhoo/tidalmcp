import fs from 'node:fs';
import { canonical, sha256, opaque } from './util.mjs';
const FIELDS = ['event','requestId','principalHash','tool','method','route','status','durationMs','errorCode'];
export function verifyAudit(text) {
  let previousHash = '0'.repeat(64), sequence = 0;
  for (const line of text.split('\n').filter(Boolean)) {
    const { hash, ...record } = JSON.parse(line);
    if (record.sequence !== sequence + 1 || record.previousHash !== previousHash || sha256(canonical(record)) !== hash) return {valid:false, sequence:sequence+1};
    sequence++; previousHash = hash;
  }
  return {valid:true, sequence, lastHash:previousHash};
}
export class Audit {
  constructor(file) {
    this.file=file;this.sequence=0;this.previousHash='0'.repeat(64);
    if (file && fs.existsSync(file)) {
      const result = verifyAudit(fs.readFileSync(file,'utf8'));
      if (!result.valid) throw new Error('Audit integrity check failed; investigate before startup.');
      this.sequence=result.sequence;this.previousHash=result.lastHash;
    }
  }
  write(input) {
    const record={sequence:++this.sequence,previousHash:this.previousHash,time:new Date().toISOString()};
    for (const k of FIELDS) if (input[k] !== undefined) record[k]=input[k];
    const hash=sha256(canonical(record));
    if (this.file) fs.appendFileSync(this.file,JSON.stringify({...record,hash})+'\n',{mode:0o600});
    this.previousHash=hash;return record.requestId || opaque(12);
  }
}
