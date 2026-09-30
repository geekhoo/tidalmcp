/** Generate metadata-only evidence using the synthetic fixture, never a live account. */
import fs from 'node:fs';
import { Audit, verifyAudit } from '../src/core/audit.mjs';
import { fixture } from '../tests/helpers/fixture.mjs';

const file = new URL('../audit/runtime-example.synthetic.jsonl', import.meta.url);
if (fs.existsSync(file)) {
  throw new Error('Synthetic trace already exists. Preserve it, or explicitly remove it before generating new evidence.');
}
const test = fixture();
test.service.audit = new Audit(file);
const search = await test.service.invoke('tidal_search', { query: 'night', kind: 'tracks' }, test.principal);
if (!search.ok) throw new Error('Synthetic search failed.');
const prepared = await test.service.invoke('tidal_prepare_change', {
  change: { action: 'create_playlist', name: 'Synthetic audit example', accessType: 'UNLISTED' },
}, test.principal);
if (!prepared.ok) throw new Error('Synthetic preparation failed.');
const committed = await test.service.invoke('tidal_commit_change', {
  planId: prepared.data.planId, digest: prepared.data.digest, confirm: true,
}, test.principal);
if (!committed.ok || test.fake.mutations !== 1) throw new Error('Synthetic commit failed.');
const result = verifyAudit(fs.readFileSync(file, 'utf8'));
if (!result.valid || result.sequence !== 3) throw new Error('Synthetic audit verification failed.');
console.log(JSON.stringify({ source: 'executed synthetic fixture; no live TIDAL requests', ...result }, null, 2));
