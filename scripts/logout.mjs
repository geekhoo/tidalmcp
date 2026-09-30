import { makeRuntime } from '../src/runtime.mjs';
const runtime=await makeRuntime();
try{const id=runtime.store.read(s=>s.profiles[runtime.config.profile]);if(id)await runtime.auth.disconnect(id);console.log('Local profile disconnected. TIDAL-side grant revocation must be done in your TIDAL account settings.');}finally{runtime.close();}
