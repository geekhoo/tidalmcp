import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../src/core/config.mjs';
import { EncryptedStore } from '../src/core/store.mjs';
import { UpstreamAuth } from '../src/core/upstream-auth.mjs';
import { AgentTokens } from '../src/core/agent-tokens.mjs';
import { Audit } from '../src/core/audit.mjs';
import { fail, publicError, sha256 } from '../src/core/util.mjs';

const HELP = `Manage TIDAL MCP agent access tokens

Usage: npm run access-tokens                    Open the interactive menu in a terminal
       npm run access-tokens -- interactive     Open the interactive menu explicitly
       npm run access-tokens -- COMMAND [options]

  grants                         Show linked account IDs and granted scopes
  list                           List token IDs, names, scopes and expiry
  create --grant ID --name NAME --scopes tidal:read[,tidal:write] --out PATH
                                 Create a token in a private file
  rotate ID --out PATH            Replace a secret, retaining its agent identity
  revoke ID                      Disable a token, keeping its list entry
  delete ID                      Disable a token and remove its list entry

Create/rotate accept --days 1..90 (default 30). --out must be an absolute
path to a new file. --id ID is also accepted for rotate/revoke/delete.

Stop the owning server first: its state directory is single-writer.
Use the same deployment environment and encryption key as the server.
Secrets are written to private files, never printed. Delete does not remove
delivery files, linked accounts, music, audit history or mutation records.
See docs/BEARER_TOKENS.md for Fedora Compose commands.`;

export async function run(argv) {
  const [command, ...args] = argv;
  if (!command || ['help','--help','-h'].includes(command) || args.length === 1 && ['--help','-h'].includes(args[0])) return HELP;
  const allowed = {grants:[], list:[], create:['grant','name','scopes','days','out'], rotate:['id','days','out'], revoke:['id'], delete:['id']};
  if (!Object.hasOwn(allowed, command)) fail('INVALID_ARGUMENT', 'Unknown command. Run npm run access-tokens -- --help.');
  const options = {};
  if (['rotate','revoke','delete'].includes(command) && args[0] && !args[0].startsWith('--')) options.id = args.shift();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2), value = args[i + 1];
    if (!args[i].startsWith('--') || !allowed[command].includes(key) || Object.hasOwn(options,key) || !value || value.startsWith('--')) fail('INVALID_ARGUMENT', 'Invalid or duplicate option.');
    options[key] = value;
  }
  if (['rotate','revoke','delete'].includes(command) && !options.id) fail('INVALID_ARGUMENT', 'A token ID is required.');
  if (command === 'create' && (!options.grant || !options.name || !options.scopes)) fail('INVALID_ARGUMENT', '--grant, --name and --scopes are required.');
  if (['create','rotate'].includes(command) && (!options.out || !path.isAbsolute(options.out))) fail('INVALID_ARGUMENT', '--out must be an absolute private file path.');
  const cfg = config(), store = new EncryptedStore(cfg.dataDir,cfg.key);
  let fd;
  try {
    const tokens = new AgentTokens({store, config:cfg, auth:new UpstreamAuth({store,config:cfg})});
    if (command === 'grants') return tokens.grants();
    if (command === 'list') return tokens.list();
    const audit = new Audit(path.join(cfg.dataDir,'audit.jsonl'));
    if (['revoke','delete'].includes(command)) {
      await tokens[command](options.id);
      audit.write({event:'agent_token.' + command,principalHash:sha256(options.id),status:200});
      return {revoked:true,...(command === 'delete' ? {deleted:true} : {}),id:options.id};
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
  try {
    const args = process.argv.slice(2);
    const menu = !args.length && process.stdin.isTTY && process.stdout.isTTY || args.length === 1 && args[0] === 'interactive';
    if (menu) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) fail('TERMINAL_REQUIRED', 'Interactive mode needs a terminal. For Compose, omit -T. Use --help for scripted commands.');
      const {interactive} = await import('./agent-token-menu.mjs'); await interactive({execute:run});
    } else { const result = await run(args); console.log(typeof result === 'string' ? result : JSON.stringify(result,null,2)); }
  }
  catch (error) { console.error(JSON.stringify(publicError(error))); process.exitCode = 1; }
}
