import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class AppError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message); this.name = 'AppError'; this.code = code; this.status = status; this.details = details;
  }
}
export const fail = (code, message, status = 400, details) => { throw new AppError(code, message, status, details); };
export const opaque = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const challenge = verifier => createHash('sha256').update(verifier).digest('base64url');
export const clone = value => structuredClone(value);
export function equalSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function publicError(error) {
  if (error instanceof AppError) return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  return { code: 'INTERNAL_ERROR', message: 'The operation failed. Use the audit request ID for diagnosis; no credentials were returned.' };
}
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function retryDelay(value, now = Date.now()) {
  if (!value) return 250;
  const n = Number(value);
  return Math.max(0, Math.min(5000, Number.isFinite(n) ? n * 1000 : (Date.parse(value) - now) || 250));
}
export async function readLimited(response, limit = 2 * 1024 * 1024) {
  const announced = Number(response.headers.get('content-length'));
  if (announced > limit) { await response.body?.cancel(); fail('RESPONSE_TOO_LARGE', 'Upstream response exceeded the configured size limit.', 502); }
  if (!response.body) return '';
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); fail('RESPONSE_TOO_LARGE', 'Upstream response exceeded the configured size limit.', 502); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}
export function jsonText(text, code = 'INVALID_UPSTREAM_JSON') {
  try { return text ? JSON.parse(text) : null; }
  catch { fail(code, 'The upstream service returned invalid JSON.', 502); }
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function safeLink(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && ['tidal.com','www.tidal.com','listen.tidal.com'].includes(u.hostname) && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
}
export function safeArtwork(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && ['resources.tidal.com','images.tidal.com'].includes(u.hostname) && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
}
export function idSegment(value) {
  // Opaque IDs must remain a SINGLE non-dot URI segment, even with encoded slashes.
  if (typeof value !== 'string' || !value || value.length > 256 || value === '.' || value === '..' || /[\x00-\x1f\x7f]/.test(value)) fail('INVALID_ID', 'Expected a non-empty opaque resource ID.');
  return encodeURIComponent(value);
}
