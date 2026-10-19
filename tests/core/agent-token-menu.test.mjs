import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { manageTokens } from '../../scripts/agent-token-menu.mjs';
import { AppError } from '../../src/core/util.mjs';
import { EncryptedStore } from '../../src/core/store.mjs';
import { fixture } from '../helpers/fixture.mjs';

const grant = (id, hash) => ({grantId:id,subjectHash:hash,disabled:false,createdAt:Date.now(),upstreamScopes:['user.read','search.read','playlists.read','collection.read']});
const token = (id, name, revoked = false) => ({id,name,revoked,expiresAt:Date.now()+86400000,scopes:['tidal:read']});
async function menu(answers, execute, options = {}) {
  const lines = [];
  await manageTokens({
    ask:async prompt => {lines.push(prompt);assert.ok(answers.length,`Unexpected prompt: ${prompt}`);return answers.shift();},
    write:line => lines.push(line),execute,...options
  });
  assert.equal(answers.length,0);
  return lines.join('\n');
}

test('interactive creation selects a linked account without copied IDs and never prints a secret', async () => {
  const calls = [], out = path.resolve('private-token.test');
  const output = await menu(['1','9','2','my-agent','1','','relative-path',out,'yes','0'],async args => {
    calls.push(args);
    if (args[0] === 'grants') return [grant('first-grant','111111111111'),grant('chosen-grant','222222222222')];
    return {id:'new-token-id',expiresAt:'2026-11-20T00:00:00.000Z',tokenFile:out,token:'SYNTHETIC_PRIVATE_SECRET'};
  });
  assert.deepEqual(calls,[['grants'],['create','--grant','chosen-grant','--name','my-agent','--scopes','tidal:read','--days','30','--out',out]]);
  assert.match(output,/Choose one of the listed numbers/);
  assert.match(output,/Enter an absolute file path/);
  assert.ok(!output.includes('SYNTHETIC_PRIVATE_SECRET'));
});

test('create cancellation and back navigation never issue a token', async () => {
  const calls = [];
  await menu(['1','1','my-agent','1','0','91','30','','','1','0','0'],async args => {
    calls.push(args); return [grant('grant','account')];
  },{dataDir:path.resolve('var')});
  assert.deepEqual(calls,[['grants'],['grants']]);
});

test('revoke filters revoked entries; delete includes them and both require confirmation', async () => {
  const calls = [], tokens = [token('already-revoked','old',true),token('active-token','current\x1b[31m')];
  const output = await menu(['3','1','','3','1','yes','4','1','yes','0'],async args => {
    calls.push(args);
    if (args[0] === 'list') return tokens;
    if (args[0] === 'revoke') tokens[1].revoked = true;
    return {};
  });
  assert.deepEqual(calls.filter(c => c[0] !== 'list'),[['revoke','active-token'],['delete','already-revoked']]);
  assert.match(output,/Cancelled/);
  assert.ok(!output.includes('\x1b'));
});

test('empty account/token lists and storage errors return to the menu without mutations', async () => {
  const calls = [];
  const output = await menu(['1','1','2','3','4','0'],async args => {
    calls.push(args);
    if (calls.length === 1) throw new AppError('STORE_LOCKED','Stop the owning server first.');
    return [];
  });
  assert.ok(calls.every(c => ['grants','list'].includes(c[0])));
  assert.match(output,/STORE_LOCKED/); assert.match(output,/No linked accounts/); assert.match(output,/No agent tokens/);
});

test('explicit interactive mode rejects a non-terminal before opening state', () => {
  const script = fileURLToPath(new URL('../../scripts/agent-token.mjs',import.meta.url));
  const result = spawnSync(process.execPath,[script,'interactive'],{env:{},encoding:'utf8'});
  assert.equal(result.status,1); assert.match(result.stderr,/TERMINAL_REQUIRED/); assert.match(result.stderr,/omit -T/);
});

test('interactive create, revoke and delete execute against encrypted CLI state with private delivery', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'tidal-token-menu-'));
  t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
  const f = await fixture(), key = randomBytes(32), dataDir = path.join(dir,'state');
  const store = new EncryptedStore(dataDir,key); await store.tx(s => Object.assign(s,f.store.data)); store.close();
  const env = {...process.env,DATA_DIR:dataDir,TOKEN_ENCRYPTION_KEY:key.toString('base64'),TIDAL_CLIENT_ID:'synthetic',TIDAL_CLIENT_SECRET:'',LISTEN_HOST:'127.0.0.1',PUBLIC_ORIGIN:f.config.origin,ENABLE_AGENT_TOKENS:'true',ENABLE_WRITES:'true'};
  const script = fileURLToPath(new URL('../../scripts/agent-token.mjs',import.meta.url)), out = path.join(dir,'agent.token');
  const output = await menu(['1','1','menu-agent','1','',out,'yes','3','1','yes','4','1','yes','0'],async args => {
    const result = spawnSync(process.execPath,[script,...args],{env,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    return JSON.parse(result.stdout);
  },{dataDir});
  const secret = fs.readFileSync(out,'utf8').trim(); assert.match(secret,/^tmcp_/); assert.ok(!output.includes(secret));
  const final = new EncryptedStore(dataDir,key);
  try {
    assert.equal(final.read(s => Object.values(s.families).filter(f => f.kind === 'agent-token').length),0);
    assert.equal(final.read(s => Object.keys(s.access).length),0);
    assert.ok(final.read(s => s.grants[f.principal.grantId]));
  } finally {final.close();}
  if (process.platform !== 'win32') assert.equal(fs.statSync(out).mode & 0o777,0o600);
});
