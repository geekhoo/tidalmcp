import { createAPIClient } from '@tidal-music/api';
import { TIDAL_API } from '../core/upstream-auth.mjs';
import { readLimited } from '../core/util.mjs';
/** Official TIDAL SDK adapter. Core policy owns retries; the SDK's retries are disabled.
 * A per-request provider prevents cross-account mutation of a shared token provider.
 */
export async function sdkSend({method,path,query,token,body,idempotencyKey,signal}) {
  const client=createAPIClient({getCredentials:async()=>({token})},TIDAL_API+'/',{enabled:false});
  let captured;
  client.use({async onResponse({response}){
    const text=await readLimited(response);
    captured={text,status:response.status,statusText:response.statusText,headers:new Headers(response.headers)};
    return new Response(response.status===204?null:text,{status:response.status,statusText:response.statusText,headers:response.headers});
  }});
  const headers={Accept:'application/vnd.api+json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})};
  await client[method](path,{params:{query},...(body===undefined?{}:{body}),headers,signal,redirect:'error',parseAs:'text'});
  if(!captured)throw new Error('TIDAL SDK did not produce an HTTP response.');
  return new Response(captured.status===204?null:captured.text,{status:captured.status,statusText:captured.statusText,headers:captured.headers});
}
