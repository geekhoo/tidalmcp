import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { BlobsStore, BlobsAudit } from '../../src/core/blobs-store.mjs';
import { verifyAudit } from '../../src/core/audit.mjs';
import { AppError } from '../../src/core/util.mjs';

class MockBlobs {
  constructor() { this.map = new Map(); this.failures = 0; this.generation = 0; }
  async getWithMetadata(key) {
    const entry = this.map.get(key);
    return entry ? { data: entry.data, etag: entry.etag, metadata: null } : null;
  }
  async set(key, value, options = {}) {
    if (this.failures > 0) { this.failures--; throw new Error('network down after possible write'); }
    const entry = this.map.get(key);
    if (options.onlyIfNew && entry) return { modified: false };
    if (options.onlyIfMatch && (!entry || entry.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = 'e' + ++this.generation;
    this.map.set(key, { data: value, etag });
    return { modified: true, etag };
  }
}
const key = randomBytes(32);

test('blobs store round-trips state through an encrypted envelope', async () => {
  const blobs = new MockBlobs();
  const a = await new BlobsStore(blobs, key).load();
  await a.tx(s => { s.clients.c1 = { name: 'test client' }; });
  const raw = blobs.map.get('state.enc.json').data, envelope = JSON.parse(raw);
  assert.equal(envelope.version, 1);
  assert.ok(envelope.iv && envelope.tag && envelope.ciphertext);
  assert.ok(!raw.includes('test client'), 'ciphertext must not leak plaintext');
  const b = await new BlobsStore(blobs, key).load();
  assert.equal(b.data.clients.c1.name, 'test client');
});

test('blobs store fails closed on a wrong encryption key', async () => {
  const blobs = new MockBlobs();
  const a = await new BlobsStore(blobs, key).load();
  await a.tx(s => { s.profiles.local = 'grant-1'; });
  const wrong = await new BlobsStore(blobs, randomBytes(32)).load().catch(error => error);
  assert.ok(wrong instanceof AppError);
  assert.equal(wrong.code, 'STORE_DECRYPTION_FAILED');
});

test('CAS rejection re-runs the transaction on fresh state', async () => {
  const blobs = new MockBlobs();
  const a = await new BlobsStore(blobs, key).load();
  const b = await new BlobsStore(blobs, key).load();
  await a.tx(s => { s.clients.fromA = { name: 'a' }; });
  // b still holds the pre-write etag: its first write is definitively rejected by CAS
  const result = await b.tx(s => {
    s.clients.fromB = { name: 'b' };
    return Object.keys(s.clients).sort().join(',');
  });
  assert.equal(result, 'fromA,fromB', 'transaction must observe the freshly read state');
  const c = await new BlobsStore(blobs, key).load();
  assert.deepEqual(Object.keys(c.data.clients).sort(), ['fromA', 'fromB']);
});

test('unknown write outcome fails closed without re-applying the transaction', async () => {
  const blobs = new MockBlobs();
  const a = await new BlobsStore(blobs, key).load();
  blobs.failures = 1;
  const error = await a.tx(s => { s.clients.x = { name: 'x' }; }).catch(e => e);
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'STORE_WRITE_UNKNOWN');
  const b = await new BlobsStore(blobs, key).load();
  assert.deepEqual(b.data.clients, {}, 'the uncertain write must not silently become state');
});

test('serial transactions persist in submission order', async () => {
  const blobs = new MockBlobs();
  const a = await new BlobsStore(blobs, key).load();
  await Promise.all([a.tx(s => { s.a = 1; }), a.tx(s => { s.b = 2; }), a.tx(s => { s.c = 3; })]);
  const b = await new BlobsStore(blobs, key).load();
  assert.deepEqual({ a: b.data.a, b: b.data.b, c: b.data.c }, { a: 1, b: 2, c: 3 });
});

test('async transactions are rejected like the file store', async () => {
  const blobs = new MockBlobs();
  const a = await new BlobsStore(blobs, key).load();
  const error = await a.tx(async s => { s.x = 1; }).catch(e => e);
  assert.match(String(error), /synchronous/);
});

test('audit flush writes a verifiable hash chain', async () => {
  const blobs = new MockBlobs();
  const audit = await new BlobsAudit(blobs).load();
  audit.write({ event: 'http.request', requestId: 'r1', route: '/mcp', method: 'POST', status: 200 });
  audit.write({ event: 'http.request', requestId: 'r2', route: '/token', method: 'POST', status: 200 });
  await audit.flush();
  const result = verifyAudit(blobs.map.get('audit.jsonl').data);
  assert.equal(result.valid, true);
  assert.equal(result.sequence, 2);
});

test('audit CAS conflict re-chains pending records onto the other writer tail', async () => {
  const blobs = new MockBlobs();
  const a = await new BlobsAudit(blobs).load();
  const b = await new BlobsAudit(blobs).load();
  a.write({ event: 'x', requestId: 'a1' }); await a.flush();
  b.write({ event: 'x', requestId: 'b1' }); await b.flush(); // b must re-chain after a
  const result = verifyAudit(blobs.map.get('audit.jsonl').data);
  assert.equal(result.valid, true);
  assert.equal(result.sequence, 2);
  const lines = blobs.map.get('audit.jsonl').data.trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map(l => l.requestId), ['a1', 'b1']);
  assert.equal(lines[1].previousHash, lines[0].hash);
});

test('audit unknown write outcome fails closed', async () => {
  const blobs = new MockBlobs();
  const audit = await new BlobsAudit(blobs).load();
  audit.write({ event: 'x', requestId: 'r1' });
  blobs.failures = 1;
  const error = await audit.flush().catch(e => e);
  assert.ok(error instanceof AppError);
  assert.equal(error.code, 'STORE_WRITE_UNKNOWN');
});
