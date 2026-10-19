import { fail, opaque, sha256 } from './util.mjs';
import { READ_SCOPES, WRITE_SCOPES } from './upstream-auth.mjs';

const DAY = 86400000;
/** Operator-only credentials using the same account/resource-bound verifier as OAuth.
 * Call through the owning store; never open a second writer against a running server.
 */
export class AgentTokens {
  constructor({store, auth, config, now = Date.now}) { Object.assign(this, {store, auth, config, now}); }
  enabled() {
    if (!this.config.enableAgentTokens) fail('AGENT_TOKENS_DISABLED', 'The operator has disabled agent tokens.', 403);
  }
  expiry(days) {
    if (!Number.isInteger(days) || days < 1 || days > 90) fail('INVALID_TOKEN_LIFETIME', 'Token lifetime must be 1 to 90 days.');
    return this.now() + days * DAY;
  }
  authorize(grantId, scopes) {
    const grant = this.auth.grant(grantId);
    if (!grant || grant.disabled) fail('TIDAL_RECONNECT_REQUIRED', 'Select an active linked TIDAL grant.', 401);
    if (!Array.isArray(scopes) || !scopes.includes('tidal:read') || new Set(scopes).size !== scopes.length || scopes.some(s => !['tidal:read', 'tidal:write'].includes(s))) fail('invalid_scope', 'Use tidal:read, optionally with tidal:write.');
    if (scopes.includes('tidal:write') && !this.config.enableWrites) fail('WRITES_DISABLED', 'The operator has disabled writes.', 403);
    const required = [...READ_SCOPES, ...(scopes.includes('tidal:write') ? WRITE_SCOPES : [])];
    if (required.some(s => !grant.token.scopes.includes(s))) fail('TIDAL_SCOPE_REQUIRED', 'The linked account lacks required upstream scopes.', 403);
    return grant;
  }
  grants() {
    return this.store.read(s => Object.values(s.grants).map(g => ({grantId:g.id, subjectHash:sha256(g.subject), disabled:g.disabled, createdAt:g.createdAt, upstreamScopes:g.token.scopes})));
  }
  list() {
    return this.store.read(s => Object.entries(s.families).filter(([,f]) => f.kind === 'agent-token').map(([id,f]) => ({id, name:f.name, grantId:f.grantId, clientId:f.clientId, scopes:f.scopes, createdAt:f.createdAt, expiresAt:f.expiresAt, revoked:f.revoked})));
  }
  async create({grantId, name, scopes, days = 30}) {
    this.enabled(); this.authorize(grantId, scopes);
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) fail('INVALID_AGENT_NAME', 'Supply an agent name of 1 to 100 printable characters.');
    const expiresAt = this.expiry(days), id = opaque(24), token = 'tmcp_' + opaque(32);
    await this.store.tx(s => {
      if (Object.values(s.families).filter(f => f.kind === 'agent-token' && !f.revoked && f.expiresAt > this.now()).length >= 100) fail('AGENT_TOKEN_LIMIT', 'Revoke unused agent tokens before creating more.', 429);
      const family = {kind:'agent-token', name:name.trim(), grantId, clientId:'agent:' + id, resource:this.config.resource, scopes:[...scopes], createdAt:this.now(), expiresAt, revoked:false};
      s.families[id] = family;
      s.access[sha256(token)] = {familyId:id, grantId, clientId:family.clientId, resource:family.resource, scopes:[...scopes], expiresAt};
    });
    return {id, token, expiresAt};
  }
  async rotate(id, days = 30) {
    this.enabled();
    const expiresAt = this.expiry(days), token = 'tmcp_' + opaque(32);
    await this.store.tx(s => {
      const f = s.families[id];
      if (!f || f.kind !== 'agent-token' || f.revoked || f.expiresAt <= this.now() || f.resource !== this.config.resource) fail('AGENT_TOKEN_INVALID', 'Select an active agent token for this resource.');
      this.authorize(f.grantId, f.scopes);
      for (const [key,a] of Object.entries(s.access)) if (a.familyId === id) delete s.access[key];
      f.expiresAt = expiresAt;
      s.access[sha256(token)] = {familyId:id, grantId:f.grantId, clientId:f.clientId, resource:f.resource, scopes:[...f.scopes], expiresAt};
    });
    return {id, token, expiresAt};
  }
  async revoke(id) {
    await this.store.tx(s => {
      const f = s.families[id];
      if (!f || f.kind !== 'agent-token') fail('AGENT_TOKEN_INVALID', 'Unknown agent token.');
      f.revoked = true;
      for (const [key,a] of Object.entries(s.access)) if (a.familyId === id) delete s.access[key];
    });
  }
}
