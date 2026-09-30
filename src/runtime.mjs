import path from 'node:path';
import { config as readConfig } from './core/config.mjs';
import { EncryptedStore } from './core/store.mjs';
import { Audit } from './core/audit.mjs';
import { UpstreamAuth } from './core/upstream-auth.mjs';
import { OAuthBroker } from './core/oauth.mjs';
import { TidalClient } from './core/tidal-client.mjs';
import { Plans } from './core/plans.mjs';
import { TidalService } from './core/service.mjs';
export function makeRuntime({config=readConfig(),send,fetchImpl}={}) {
  const store=new EncryptedStore(config.dataDir,config.key);
  try {
    const audit=new Audit(path.join(config.dataDir,'audit.jsonl')),auth=new UpstreamAuth({store,config,fetchImpl}),broker=new OAuthBroker({store,auth,config}),client=new TidalClient({auth,send}),plans=new Plans({store,client,auth,config}),service=new TidalService({client,auth,plans,config,audit});
    // A crash with an in-flight write must never result in a fresh idempotency key.
    store.tx(s=>{for(const p of Object.values(s.plans))if(p.status==='executing')p.status='unknown';});
    const localPrincipal=()=>{
      const grantId=store.read(s=>s.profiles[config.profile]),grant=auth.grant(grantId);
      return {grantId,subject:grant?.subject||`local:${config.profile}`,clientId:`stdio:${config.profile}`,scopes:config.enableWrites?['tidal:read','tidal:write']:['tidal:read'],local:true};
    };
    return {store,audit,auth,broker,client,plans,service,config,localPrincipal,close:()=>store.close()};
  }catch(error){store.close();throw error;}
}
