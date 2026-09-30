import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { clone, fail, opaque, canonical, sha256 } from './util.mjs';
import { MemoryStore, emptyState } from './store.mjs';
import { verifyAudit } from './audit.mjs';

const AAD = Buffer.from('tidal-mcp-state:v1');
const AUDIT_FIELDS = ['event', 'requestId', 'principalHash', 'tool', 'method', 'route', 'status', 'durationMs', 'errorCode'];
function seal(data, key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}
function open(envelope, key) {
  if (envelope.version !== 1) throw new Error('Unsupported envelope');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  const data = JSON.parse(plain.toString('utf8'));
  if (data.version !== 1) throw new Error('Unsupported state');
  return data;
}
function chainLine(record, tail) {
  const base = { sequence: tail.sequence + 1, previousHash: tail.previousHash, time: record.time };
  for (const k of AUDIT_FIELDS) if (record[k] !== undefined) base[k] = record[k];
  return JSON.stringify({ ...base, hash: sha256(canonical(base)) }) + '\n';
}
/** Same encrypted envelope as EncryptedStore, persisted through a Netlify Blobs-compatible
 * store ({getWithMetadata,set} with etag/onlyIfMatch/onlyIfNew). The whole document is the
 * transaction unit, mirroring EncryptedStore's atomic-rename semantics: a definitive CAS
 * rejection re-reads and re-runs the transaction on fresh state; an indeterminate write outcome
 * fails closed and is never silently retried — recovery from an unknown outcome must not mint a
 * second mutation. Accepts an injected store so tests run against a local mock without
 * @netlify/blobs. Cross-instance writers are serialized only by CAS; keep transactions short. */
export class BlobsStore extends MemoryStore {
  #etag;
  #serial = Promise.resolve();
  constructor(blobStore, key, stateKey = 'state.enc.json') {
    super();
    if (!Buffer.isBuffer(key) || key.length !== 32) fail('CONFIG_ERROR', 'Encryption key must contain exactly 32 bytes.', 500);
    this.blobStore = blobStore; this.key = key; this.stateKey = stateKey;
  }
  async load() {
    let record;
    try { record = await this.blobStore.getWithMetadata(this.stateKey, { type: 'text' }); }
    catch { fail('STORE_UNAVAILABLE', 'State storage is unreachable. No plaintext state was loaded.', 500); }
    if (record && record.data !== null && record.data !== undefined) {
      try { this.data = open(JSON.parse(record.data), this.key); }
      catch { fail('STORE_DECRYPTION_FAILED', 'State is corrupted or the encryption key is incorrect. No plaintext state was loaded.', 500); }
      this.#etag = record.etag;
    } else { this.data = emptyState(); this.#etag = record ? record.etag : undefined; }
    return this;
  }
  async tx(fn) {
    // Serialize writers within this instance; cross-instance races are handled by CAS.
    const run = this.#serial.then(async () => {
      let attempts = 0;
      for (;;) {
        const copy = clone(this.data), result = fn(copy);
        if (result instanceof Promise) throw new Error('Store transactions must be synchronous.');
        let outcome;
        try {
          const options = this.#etag === undefined ? { onlyIfNew: true } : { onlyIfMatch: this.#etag };
          outcome = await this.blobStore.set(this.stateKey, JSON.stringify(seal(copy, this.key)), options);
        } catch {
          fail('STORE_WRITE_UNKNOWN', 'State write outcome is unknown; the change was not re-applied. Inspect state before retrying.', 500);
        }
        if (outcome.modified) { this.data = copy; this.#etag = outcome.etag || this.#etag; return clone(result); }
        if (++attempts > 8) fail('STORE_CONFLICT', 'State storage is under write contention. Retry the request.', 409);
        let record;
        try { record = await this.blobStore.getWithMetadata(this.stateKey, { type: 'text' }); }
        catch { fail('STORE_UNAVAILABLE', 'State storage is unreachable during conflict resolution.', 500); }
        if (!record || record.data === null || record.data === undefined) fail('STORE_CONFLICT', 'State disappeared during a write. Investigate storage before retrying.', 409);
        try { this.data = open(JSON.parse(record.data), this.key); } catch { fail('STORE_DECRYPTION_FAILED', 'State is corrupted or the encryption key is incorrect.', 500); }
        this.#etag = record.etag;
      }
    });
    this.#serial = run.catch(() => {});
    return run;
  }
  close() {}
}
/** Hash-chained audit log persisted as one CAS-guarded blob, chain-compatible with Audit and
 * verifyAudit. write() enqueues synchronously (same call shape as Audit); flush() drains the
 * queue and must be awaited before the request completes. Sequence/hash are computed at persist
 * time so CAS retries re-chain the pending records correctly. */
export class BlobsAudit {
  #pending = [];
  #tail = { sequence: 0, previousHash: '0'.repeat(64) };
  #text = '';
  #etag;
  #serial = Promise.resolve();
  constructor(blobStore, auditKey = 'audit.jsonl') { this.blobStore = blobStore; this.auditKey = auditKey; }
  async load() {
    let record;
    try { record = await this.blobStore.getWithMetadata(this.auditKey, { type: 'text' }); }
    catch { fail('STORE_UNAVAILABLE', 'Audit storage is unreachable.', 500); }
    if (record && record.data) {
      const result = verifyAudit(record.data);
      if (!result.valid) throw new Error('Audit integrity check failed; investigate before startup.');
      this.#text = record.data; this.#tail = { sequence: result.sequence, previousHash: result.lastHash }; this.#etag = record.etag;
    } else if (record) this.#etag = record.etag;
    return this;
  }
  write(input) {
    const record = { ...input, time: new Date().toISOString() };
    this.#pending.push(record);
    return record.requestId || opaque(12);
  }
  async flush() {
    if (!this.#pending.length) return;
    const drain = this.#serial.then(async () => {
      while (this.#pending.length) {
        const attempt = this.#pending.slice();
        let text = this.#text, tail = { ...this.#tail };
        for (const record of attempt) {
          const line = chainLine(record, tail);
          const full = JSON.parse(line);
          text += line; tail = { sequence: full.sequence, previousHash: full.hash };
        }
        let outcome;
        try {
          const options = this.#etag === undefined ? { onlyIfNew: true } : { onlyIfMatch: this.#etag };
          outcome = await this.blobStore.set(this.auditKey, text, options);
        } catch {
          fail('STORE_WRITE_UNKNOWN', 'Audit write outcome is unknown; records were not re-applied.', 500);
        }
        if (outcome.modified) { this.#text = text; this.#tail = tail; this.#etag = outcome.etag || this.#etag; this.#pending.splice(0, attempt.length); continue; }
        // Another writer appended first: re-read the tail and re-chain our pending records.
        let record;
        try { record = await this.blobStore.getWithMetadata(this.auditKey, { type: 'text' }); }
        catch { fail('STORE_UNAVAILABLE', 'Audit storage is unreachable during conflict resolution.', 500); }
        const result = verifyAudit(record?.data || '');
        if (!result.valid) throw new Error('Audit integrity check failed; investigate before writing.');
        this.#text = record.data || ''; this.#tail = { sequence: result.sequence, previousHash: result.lastHash }; this.#etag = record.etag;
      }
    });
    this.#serial = drain.catch(() => {});
    return drain;
  }
}
