import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { clone, fail, opaque } from './util.mjs';
export function emptyState() {
  return { version: 1, clients: {}, pending: {}, codes: {}, access: {}, refresh: {}, families: {}, grants: {}, profiles: {}, plans: {} };
}
export class MemoryStore {
  constructor(data = emptyState()) { this.data = clone(data); }
  read(fn) { return clone(fn(this.data)); }
  tx(fn) {
    const copy = clone(this.data); const result = fn(copy);
    if (result instanceof Promise) throw new Error('Store transactions must be synchronous.');
    this.persist(copy); this.data = copy; return clone(result);
  }
  persist() {}
  close() {}
}
/** Atomic encrypted single-process store. Never share this directory across replicas. */
export class EncryptedStore extends MemoryStore {
  constructor(directory, key) {
    super();
    if (!Buffer.isBuffer(key) || key.length !== 32) fail('CONFIG_ERROR', 'Encryption key must contain exactly 32 bytes.', 500);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('CONFIG_ERROR', 'State directory must be a real private directory.', 500);
    fs.chmodSync(directory, 0o700);
    this.directory = directory; this.key = key; this.file = path.join(directory, 'state.enc.json'); this.lock = path.join(directory, 'writer.lock');
    try { this.lockFd = fs.openSync(this.lock, 'wx', 0o600); fs.writeFileSync(this.lockFd, JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()})); }
    catch { fail('STORE_LOCKED', 'Another process owns the state directory, or a stale lock needs operator review. Never remove a live lock.', 500); }
    try {
      if (fs.existsSync(this.file)) {
        const envelope = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (envelope.version !== 1) throw new Error('Unsupported envelope');
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
        decipher.setAAD(Buffer.from('tidal-mcp-state:v1'));
        decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
        const plain = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
        this.data = JSON.parse(plain.toString('utf8'));
        if (this.data.version !== 1) throw new Error('Unsupported state');
      }
    } catch { this.close(); fail('STORE_DECRYPTION_FAILED', 'State is corrupted or the encryption key is incorrect. No plaintext state was loaded.', 500); }
  }
  persist(data) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('tidal-mcp-state:v1'));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    const envelope = { version:1, iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:ciphertext.toString('base64') };
    const temp = path.join(this.directory, `.state-${opaque(8)}.tmp`);
    let fd;
    try {
      fd = fs.openSync(temp, 'wx', 0o600); fs.writeFileSync(fd, JSON.stringify(envelope)); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(temp, this.file);
      // Directory fsync is supported on POSIX; Windows does not permit opening directories this way.
      if (process.platform !== 'win32') { const dir = fs.openSync(this.directory, 'r'); try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); } }
    } finally { if (fd !== undefined) fs.closeSync(fd); if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  close() {
    if (this.lockFd !== undefined) { fs.closeSync(this.lockFd); this.lockFd = undefined; fs.unlinkSync(this.lock); }
  }
}
