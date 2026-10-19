import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fixture } from '../helpers/fixture.mjs';
import { AgentTokens } from '../../src/core/agent-tokens.mjs';
import { EncryptedStore } from '../../src/core/store.mjs';
import { httpServer } from '../../src/core/http.mjs';
import { sha256 } from '../../src/core/util.mjs';

async function setup(options = {}) {
  const f = await fixture({...options, config:{enableAgentTokens:true,...options.config}});
  return {...f, tokens:new AgentTokens(f), issue:extra => new AgentTokens(f).create({grantId:f.principal.grantId,name:'test-agent',scopes:['tidal:read'],...extra})};
}

test('per-agent tokens share one grant, retain distinct client identities and store only hashes', async () => {
  const f = await setup(), a = await f.issue(), b = await f.issue({name:'second'});
  const pa = f.broker.verify(a.token), pb = f.broker.verify(b.token);
  assert.equal(pa.grantId,pb.grantId); assert.notEqual(pa.clientId,pb.clientId);
  assert.match(a.token,/^tmcp_[A-Za-z0-9_-]{43}$/);
  assert.equal(pa.expiresAt,Math.floor(a.expiresAt/1000));
  assert.ok(!JSON.stringify(f.store.data).includes(a.token));
  assert.ok(!JSON.stringify(f.tokens.list()).includes(a.token));
  assert.equal(Object.keys(f.store.data.refresh).length,0);
  assert.throws(() => f.broker.verify('synthetic-initial-access'),e => e.code === 'invalid_token');
});

test('expiry, resource binding and the operator kill switch fail closed', async () => {
  let now = Date.now();
  const f = await setup({now:() => now}); f.tokens.now = () => now;
  const a = await f.tokens.create({grantId:f.principal.grantId,name:'agent',scopes:['tidal:read'],days:1});
  f.config.enableAgentTokens = false;
  assert.throws(() => f.broker.verify(a.token),e => e.code === 'invalid_token');
  f.config.enableAgentTokens = true;
  const resource = f.config.resource; f.config.resource += '/other';
  assert.throws(() => f.broker.verify(a.token),e => e.code === 'invalid_token');
  f.config.resource = resource; now += 86400000;
  assert.throws(() => f.broker.verify(a.token),e => e.code === 'invalid_token');
});

test('revocation affects one agent; account disconnect invalidates all agent tokens', async () => {
  const f = await setup(), a = await f.issue(), b = await f.issue();
  await f.tokens.revoke(a.id);
  assert.throws(() => f.broker.verify(a.token)); assert.ok(f.broker.verify(b.token));
  await f.auth.disconnect(f.principal.grantId);
  assert.throws(() => f.broker.verify(b.token),e => e.code === 'invalid_token');
});

test('deleting an active token invalidates it while preserving other agents, OAuth and recovery state', async () => {
  const f = await setup(), a = await f.issue(), b = await f.issue();
  await f.store.tx(s => {
    s.families.oauth = {kind:'oauth',grantId:f.principal.grantId};
    s.refresh.oldAgent = {familyId:a.id}; s.refresh.oauth = {familyId:'oauth'};
    s.plans.uncertain = {grantId:f.principal.grantId,clientId:f.broker.verify(a.token).clientId,status:'unknown',idempotencyKey:'keep-this-key'};
  });
  const before = f.store.read(s => ({grant:s.grants[f.principal.grantId],plan:s.plans.uncertain,oauth:s.families.oauth}));
  await f.tokens.delete(a.id);
  assert.throws(() => f.broker.verify(a.token),e => e.code === 'invalid_token');
  assert.ok(f.broker.verify(b.token)); assert.ok(!f.tokens.list().some(t => t.id === a.id));
  assert.equal(f.store.read(s => s.refresh.oldAgent),undefined);
  assert.deepEqual(f.store.read(s => ({grant:s.grants[f.principal.grantId],plan:s.plans.uncertain,oauth:s.families.oauth})),before);
  assert.ok(f.store.read(s => s.refresh.oauth));
  await assert.rejects(f.tokens.delete('oauth'),e => e.code === 'AGENT_TOKEN_INVALID');
  await assert.rejects(f.tokens.delete('unknown'),e => e.code === 'AGENT_TOKEN_INVALID');
});

test('CLI help works without server credentials or state', () => {
  const script = fileURLToPath(new URL('../../scripts/agent-token.mjs',import.meta.url));
  for (const args of [[],['--help'],['create','--help']]) {
    const result = spawnSync(process.execPath,[script,...args],{env:{},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/revoke ID/); assert.match(result.stdout,/delete ID/);
    assert.match(result.stdout,/Stop the owning server first/);
  }
});

test('read-only tokens cannot prepare writes; write tokens cannot use another agent preview', async () => {
  const f = await setup(), read = await f.issue(), a = await f.issue({scopes:['tidal:read','tidal:write']}), b = await f.issue({scopes:['tidal:read','tidal:write']});
  const change = {action:'create_playlist',name:'Synthetic token test'};
  await assert.rejects(f.plans.prepare(f.broker.verify(read.token),change),e => e.code === 'MCP_WRITE_SCOPE_REQUIRED');
  const preview = await f.plans.prepare(f.broker.verify(a.token),change);
  await assert.rejects(f.plans.commit(f.broker.verify(b.token),preview.planId,preview.digest,true),e => e.code === 'PLAN_NOT_FOUND');
  assert.equal(f.fake.mutations,0);
});

test('rotation invalidates the previous secret while preserving preview ownership', async () => {
  const f = await setup(), a = await f.issue({scopes:['tidal:read','tidal:write']}), p = f.broker.verify(a.token);
  const preview = await f.plans.prepare(p,{action:'create_playlist',name:'Synthetic rotation'});
  const rotated = await f.tokens.rotate(a.id);
  assert.throws(() => f.broker.verify(a.token));
  assert.equal(f.broker.verify(rotated.token).clientId,p.clientId);
  assert.equal(f.plans.own(f.broker.verify(rotated.token),preview.planId).digest,preview.digest);
  await f.tokens.revoke(a.id);
  await assert.rejects(f.tokens.rotate(a.id),e => e.code === 'AGENT_TOKEN_INVALID');
});

test('issuance rejects invalid permissions, lifetimes and inactive or underscoped accounts', async () => {
  const f = await setup();
  for (const scopes of [[],['tidal:write'],['tidal:read','admin'],['tidal:read','tidal:read']]) await assert.rejects(f.issue({scopes}),e => e.code === 'invalid_scope');
  for (const days of [0,91,1.5,NaN]) await assert.rejects(f.issue({days}),e => e.code === 'INVALID_TOKEN_LIFETIME');
  f.config.enableWrites = false;
  await assert.rejects(f.issue({scopes:['tidal:read','tidal:write']}),e => e.code === 'WRITES_DISABLED');
  f.config.enableWrites = true;
  await f.store.tx(s => {s.grants[f.principal.grantId].token.scopes = ['user.read'];});
  await assert.rejects(f.issue(),e => e.code === 'TIDAL_SCOPE_REQUIRED');
  await f.auth.disconnect(f.principal.grantId);
  await assert.rejects(f.issue(),e => e.code === 'TIDAL_RECONNECT_REQUIRED');
});

test('pruning retains an account referenced only by a live agent token', async () => {
  const f = await setup(), a = await f.issue();
  await f.store.tx(s => {s.grants[f.principal.grantId].createdAt -= 2*86400000;});
  await f.broker.prune();
  assert.ok(f.broker.verify(a.token));
  await f.store.tx(s => {s.families[a.id].expiresAt = 0;});
  await f.broker.prune();
  assert.equal(f.auth.grant(f.principal.grantId),undefined);
});

test('agent tokens cross the native HTTP boundary; invalid/query tokens never reach MCP dispatch', async t => {
  const f = await setup(), received = [];
  const server = httpServer({...f,mcpHandler:async(req,res,body,principal) => {received.push(principal);res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');}});
  await new Promise(r => server.listen(0,'127.0.0.1',r));
  t.after(() => new Promise(r => {server.closeAllConnections();server.close(r);}));
  f.config.origin = `http://127.0.0.1:${server.address().port}`; f.config.resource = f.config.origin + '/mcp';
  const a = await f.issue();
  const request = (token, query = '') => new Promise((resolve,reject) => {
    const req = http.request(f.config.resource + query,{method:'POST',headers:{'Content-Type':'application/json',...(token ? {Authorization:'Bearer ' + token} : {})}},res => {res.resume();res.on('end',() => resolve({status:res.statusCode}));});
    req.on('error',reject); req.end('{}');
  });
  assert.equal((await request(a.token)).status,200);
  for (const token of ['bad-token','synthetic-initial-access','bad.token']) assert.equal((await request(token)).status,401);
  assert.equal((await request(null,'?access_token=' + a.token)).status,401);
  await f.tokens.revoke(a.id); assert.equal((await request(a.token)).status,401);
  assert.equal(received.length,1);
});

test('operator CLI preserves encrypted state, private output and single-writer locking', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'tidal-agent-cli-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const f = await setup(), key = randomBytes(32), store = new EncryptedStore(path.join(dir,'state'),key);
  await store.tx(s => Object.assign(s,f.store.data)); store.close();
  const env = {...process.env,DATA_DIR:path.join(dir,'state'),TOKEN_ENCRYPTION_KEY:key.toString('base64'),TIDAL_CLIENT_ID:'synthetic',TIDAL_CLIENT_SECRET:'',LISTEN_HOST:'127.0.0.1',PUBLIC_ORIGIN:f.config.origin,ENABLE_AGENT_TOKENS:'true',ENABLE_WRITES:'true'};
  const script = fileURLToPath(new URL('../../scripts/agent-token.mjs',import.meta.url));
  const run = args => spawnSync(process.execPath,[script,...args],{env,encoding:'utf8'});
  const out = path.join(dir,'private-token'), args = ['create','--grant',f.principal.grantId,'--name','cli-agent','--scopes','tidal:read','--out',out];
  const result = run(args); assert.equal(result.status,0,result.stderr);
  const token = fs.readFileSync(out,'utf8').trim(), meta = JSON.parse(result.stdout);
  assert.ok(!result.stdout.includes(token)); assert.ok(!result.stderr.includes(token));
  if (process.platform !== 'win32') assert.equal(fs.statSync(out).mode & 0o777,0o600);
  assert.notEqual(run(args).status,0); assert.equal(fs.readFileSync(out,'utf8').trim(),token);
  const reopened = new EncryptedStore(env.DATA_DIR,key);
  assert.ok(reopened.read(s => s.access[sha256(token)]));
  assert.notEqual(run(['list']).status,0); reopened.close();
  assert.notEqual(run(['revoke',meta.id,'--id',meta.id]).status,0);
  assert.equal(run(['revoke',meta.id]).status,0);
  assert.equal(JSON.parse(run(['list']).stdout).find(t => t.id === meta.id).revoked,true);
  const deleted = run(['delete',meta.id]); assert.equal(deleted.status,0,deleted.stderr);
  assert.equal(JSON.parse(deleted.stdout).deleted,true);
  assert.ok(!JSON.parse(run(['list']).stdout).some(t => t.id === meta.id));
  const final = new EncryptedStore(env.DATA_DIR,key);
  assert.equal(final.read(s => s.access[sha256(token)]),undefined);
  assert.equal(final.read(s => s.families[meta.id]),undefined); final.close();
  assert.equal(fs.readFileSync(out,'utf8').trim(),token);
  assert.ok(!fs.readFileSync(path.join(env.DATA_DIR,'audit.jsonl'),'utf8').includes(token));
});
