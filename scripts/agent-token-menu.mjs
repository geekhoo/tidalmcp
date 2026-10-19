import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { publicError } from '../src/core/util.mjs';

const safe = value => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g,'');
const date = value => new Date(value).toISOString();
const status = token => token.revoked ? 'revoked' : token.expiresAt <= Date.now() ? 'expired' : 'active';
const accountLabel = grant => `Account ${grant.subjectHash.slice(0,12)} | linked ${date(grant.createdAt)} | ${grant.upstreamScopes.join(', ')}`;
const tokenLabel = token => `${safe(token.name)} | ${status(token)} | expires ${date(token.expiresAt)} | ${token.scopes.join(', ')} | ${token.id.slice(0,8)}`;

/** Injectable terminal I/O keeps menu tests independent of real accounts and secrets. */
export async function manageTokens({ask, write, execute, dataDir = process.env.DATA_DIR || './var'}) {
  async function select(title, items, label) {
    write(title);
    items.forEach((item,index) => write(`  ${index+1}. ${label(item)}`));
    write('  0. Back');
    for (;;) {
      const answer = (await ask('Choose a number: ')).trim();
      if (answer === '0') return undefined;
      if (/^[1-9]\d*$/.test(answer) && Number(answer) <= items.length) return items[Number(answer)-1];
      write('Choose one of the listed numbers.');
    }
  }
  async function field(prompt, valid, error, fallback) {
    for (;;) {
      const answer = (await ask(prompt)).trim() || fallback;
      if (valid(answer)) return answer;
      write(error);
    }
  }
  const confirmed = async prompt => /^(y|yes)$/i.test((await ask(prompt + ' [y/N]: ')).trim());
  write('TIDAL MCP access tokens — stop the owning server before managing tokens.');
  write('Secrets are saved to private files and never displayed. Ctrl+C exits.');
  for (;;) {
    write('\n1. Create token\n2. List tokens\n3. Revoke token\n4. Delete token\n0. Exit');
    const action = (await ask('Choose an action: ')).trim();
    if (action === '0') return;
    if (!['1','2','3','4'].includes(action)) { write('Choose one of the listed numbers.'); continue; }
    try {
      if (action === '1') {
        const grants = (await execute(['grants'])).filter(g => !g.disabled);
        if (!grants.length) { write('No linked accounts. Exit, start the server and link your TIDAL account through OAuth first.'); continue; }
        const grant = await select('Select a linked account (fingerprint identifies the account):',grants,accountLabel);
        if (!grant) continue;
        const name = await field('Agent name: ',v => typeof v === 'string' && v.length > 0 && v.length <= 100 && !/[\x00-\x1f\x7f-\x9f]/.test(v),'Enter a printable name of 1 to 100 characters.');
        const permissions = await select('Select permissions:',[{label:'Read only',scopes:'tidal:read'},{label:'Read and write (each music change still needs approval)',scopes:'tidal:read,tidal:write'}],p => p.label);
        if (!permissions) continue;
        const days = await field('Lifetime in days [30]: ',v => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 90,'Enter a whole number from 1 to 90.','30');
        const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'') || 'agent';
        const fallback = path.resolve(dataDir,`${slug}-${Date.now()}.token`);
        const out = await field(`Private output file [${fallback}]: `,v => typeof v === 'string' && path.isAbsolute(v) && !/[\x00-\x1f\x7f-\x9f]/.test(v),'Enter an absolute file path in an existing writable directory.',fallback);
        write(`Create ${safe(name)} for ${accountLabel(grant)}\nPermissions: ${permissions.scopes}\nLifetime: ${days} days\nPrivate file: ${safe(out)}`);
        if (!await confirmed('Create this token?')) { write('Cancelled.'); continue; }
        const result = await execute(['create','--grant',grant.grantId,'--name',name,'--scopes',permissions.scopes,'--days',days,'--out',out]);
        write(`Created token ${result.id}. Expires ${result.expiresAt}.\nSecret saved to ${safe(result.tokenFile)}. Copy it privately into your agent's credential settings.`);
      } else {
        const all = await execute(['list']);
        if (action === '2') {
          if (!all.length) write('No agent tokens.');
          else all.forEach(token => write(tokenLabel(token)));
          continue;
        }
        const tokens = action === '3' ? all.filter(t => !t.revoked) : all;
        if (!tokens.length) { write(action === '3' ? 'No unrevoked tokens.' : 'No agent tokens.'); continue; }
        const token = await select('Select a token:',tokens,tokenLabel);
        if (!token) continue;
        const verb = action === '3' ? 'revoke' : 'delete';
        write(verb === 'delete' ? 'This disables the token and removes its list entry. Its delivery file is kept.' : 'This disables the token and keeps its list entry.');
        if (!await confirmed(`${verb === 'delete' ? 'Delete' : 'Revoke'} ${safe(token.name)} (${token.id.slice(0,8)})?`)) { write('Cancelled.'); continue; }
        await execute([verb,token.id]);
        write(verb === 'delete' ? 'Token deleted.' : 'Token revoked.');
      }
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ERR_USE_AFTER_CLOSE') throw error;
      const known = {EEXIST:'Output file already exists; choose a new private file.',ENOENT:'Output directory does not exist.',EACCES:'Cannot access that private file or state directory.'};
      const result = publicError(error);
      write(known[error.code] || `${result.code}: ${result.message}`);
    }
  }
}

export async function interactive({execute}) {
  const input = createInterface({input:process.stdin,output:process.stdout});
  const abort = new AbortController();
  input.on('SIGINT',() => abort.abort());
  input.on('close',() => abort.abort());
  try { await manageTokens({execute,ask:prompt => input.question(prompt,{signal:abort.signal}),write:message => console.log(message)}); }
  catch (error) { if (error.name !== 'AbortError' && error.code !== 'ERR_USE_AFTER_CLOSE') throw error; }
  finally { input.close(); }
}
