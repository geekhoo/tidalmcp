import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../src/core/config.mjs';
import { EncryptedStore } from '../src/core/store.mjs';
import { UpstreamAuth } from '../src/core/upstream-auth.mjs';
import { AgentTokens } from '../src/core/agent-tokens.mjs';
import { Audit } from '../src/core/audit.mjs';
import { fail, publicError, sha256 } from '../src/core/util.mjs';

export async function run(argv) {
  const [command, ...args] = argv;
  const allowed = {grants:[], list:[], create:['grant','name','scopes','days','out'], rotate:['id','days','out'], revoke:['id']};
  if (!Object.hasOwn(allowed, command)) fail('INVALID_ARGUMENT', 'Use grants, list, create, rotate or revoke. Stop the owning server first.');
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2), value = args[i + 1];
    if (!args[i].startsWith('--') || !allowed[command].includes(key) || Object.hasOwn(options,key) || !value || value.startsWith('--')) fail('INVALID_ARGUMENT', 'Invalid or duplicate option.');
    options[key] = value;
  }
  if (['rotate','revoke'].includes(command) && !options.id) fail('INVALID_ARGUMENT', '--id is required.');
  if (command === 'create' && (!options.grant || !options.name || !options.scopes)) fail('INVALID_ARGUMENT', '--grant, --name and --scopes are required.');
  if (['create','rotate'].includes(command) && (!options.out || !path.isAbsolute(options.out))) fail('INVALID_ARGUMENT', '--out must be an absolute private file path.');
  const cfg = config(), store = new EncryptedStore(cfg.dataDir,cfg.key);
  let fd;
  try {
    const tokens = new AgentTokens({store, config:cfg, auth:new UpstreamAuth({store,config:cfg})});
    if (command === 'grants') return tokens.grants();
    if (command === 'list') return tokens.list();
    const audit = new Audit(path.join(cfg.dataDir,'audit.jsonl'));
    if (command === 'revoke') {
      await tokens.revoke(options.id);
      audit.write({event:'agent_token.revoke',principalHash:sha256(options.id),status:200});
      return {revoked:true,id:options.id};
    }
    // Refuse overwrites and reserve the private output before committing credentials.
    fd = fs.openSync(options.out,'wx',0o600);
    const result = command === 'create'
      ? await tokens.create({grantId:options.grant,name:options.name,scopes:options.scopes.split(','),days:Number(options.days || 30)})
      : await tokens.rotate(options.id,Number(options.days || 30));
    try {
      fs.writeFileSync(fd,result.token + '\n'); fs.fsyncSync(fd);
      audit.write({event:'agent_token.' + command,principalHash:sha256(result.id),status:200});
    } catch (error) { await tokens.revoke(result.id); throw error; }
    return {id:result.id,expiresAt:new Date(result.expiresAt).toISOString(),tokenFile:options.out};
  } finally { if (fd !== undefined) fs.closeSync(fd); store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await run(process.argv.slice(2)),null,2)); }
  catch (error) { console.error(JSON.stringify(publicError(error))); process.exitCode = 1; }
}
