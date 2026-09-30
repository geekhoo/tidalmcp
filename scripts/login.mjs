import { createServer } from 'node:http';
import { makeRuntime } from '../src/runtime.mjs';
import { opaque, equalSecret, publicError } from '../src/core/util.mjs';
import { READ_SCOPES, WRITE_SCOPES } from '../src/core/upstream-auth.mjs';
const runtime=makeRuntime();
const state=opaque(),redirect='http://127.0.0.1:8765/callback';
const login=runtime.auth.loginUrl(state,[...READ_SCOPES,...(runtime.config.enableWrites?WRITE_SCOPES:[])],redirect);
let complete=false;
const server=createServer(async(req,res)=>{
  try {
    if(req.headers.host!=='127.0.0.1:8765')throw new Error('Bad host');
    const url=new URL(req.url,redirect);
    if(url.pathname!=='/callback'||req.method!=='GET'||complete||!equalSecret(url.searchParams.get('state'),state))throw new Error('Invalid callback');
    complete=true;
    if(url.searchParams.has('error'))throw new Error('Authorization denied');
    const code=url.searchParams.get('code');if(!code)throw new Error('Missing code');
    const token=await runtime.auth.exchange(code,login.verifier,redirect,login.scopes),identity=await runtime.auth.identify(token);
    const prior=runtime.store.read(s=>s.profiles[runtime.config.profile]);if(prior)runtime.auth.disconnect(prior);
    const id=runtime.auth.saveGrant(token,identity);runtime.store.tx(s=>{s.profiles[runtime.config.profile]=id;});
    res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'"});res.end('TIDAL connected. Close this tab and restart your MCP client.');
    console.error('TIDAL connected; tokens were encrypted locally.');
  }catch(error){res.writeHead(400,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('Login failed. Start a new login; no credentials were displayed.');console.error(JSON.stringify(publicError(error)));}
  finally{if(complete)server.close(()=>{runtime.close();process.exit(0);});}
});
server.on('error',()=>{console.error('Could not bind 127.0.0.1:8765. Stop the conflicting process and retry.');runtime.close();process.exit(1);});
server.listen(8765,'127.0.0.1',()=>{console.error('Register http://127.0.0.1:8765/callback in your TIDAL developer app. Open this authorization URL in your own browser:\n'+login.url+'\nIt expires in 10 minutes. Do not paste it or its callback into an AI conversation.');});
const timeout=setTimeout(()=>{console.error('Login expired.');server.close(()=>{runtime.close();process.exit(1);});},600000);timeout.unref();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close(()=>{runtime.close();process.exit(1);});});
