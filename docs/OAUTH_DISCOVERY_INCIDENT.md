# OAuth discovery incident — 1 October 2026

Investigation requested after the durable chat `01a0f5d6-adc9-7671-9686-f21f8a5ec089` failed to suggest/create a daily playlist. No credentials, configuration, library contents or deployment were changed.

## Reproduction

The linked chat recorded `failed to resolve OAuth metadata before using stored credentials (code -32603)`, before `tidal_auth_status` ran. It also encountered separate Windows sandbox ACL and unsupported-model failures; the model mismatch was resolved there.

Fresh native `tidal_auth_status` and `tidal_capabilities` calls in the previously working desktop chat now both fail with `OAuth metadata discovery failed ... unexpected HTTP status 502 Bad Gateway`.

Unauthenticated GETs to both protected-resource metadata routes and the root authorization-server metadata route return 502 with `State storage is unreachable. No plaintext state was loaded.` `/healthz` and `/mcp` also return 502. This establishes a current deployed service failure independent of the durable chat's profile or model.

Repeat-probe Netlify request IDs:

- `/healthz`: `01M3TYZCMCKC9AJTANT4SYNZ3B`
- `/mcp`: `01M3TYZD6WM0S8VKZW1SBGZQ3D`
- `/.well-known/oauth-protected-resource/mcp`: `01M3TYZDR8G85T0E8GP950P4DX`

Published deploy remains `6abdacba4f5e0fa402b9b4be`, ready, published `2026-10-01T00:43:46.692Z`. Ready deployment status does not establish runtime health.

## Code findings

`netlify/functions/server.mjs` awaits `getRuntime()` before routing every request. Initialization loads the encrypted Blobs state. `BlobsStore.load()` maps any failed `getWithMetadata` call to `STORE_UNAVAILABLE`; decryption failure has a different error. The observed failure is therefore on storage retrieval, not evidence of an incorrect encryption key or expired TIDAL authorization.

Two resilience gaps amplify the incident:

- Static OAuth discovery and liveness routes depend on encrypted storage initialization and subsequent refresh.
- `runtimePromise ??=` retains a rejected initialization promise for that warm instance. A temporary first-load failure can persist on that instance even after the underlying service recovers.

The catch discards the upstream exception, so available evidence cannot distinguish Blobs HTTP authorization, availability, network or other read failures. Do not claim a platform outage, token expiration or corruption without further evidence.

## Recommended remedy and acceptance

1. Correlate the retained request IDs with Netlify function diagnostics. Record only safe upstream status/error classifications, never authorization headers, tokens, state contents or OAuth queries.
2. Clear the cached initialization promise after rejection so a later request can initialize again. Keep authenticated state-dependent routes fail-closed; do not blindly retry indeterminate writes.
3. Serve configuration-derived OAuth metadata independently of state loading. Return controlled sanitized 503 errors for unavailable state-dependent operations rather than unhandled platform 502 stack traces. Define liveness/readiness separately.
4. Add synthetic regressions for first-load failure then recovery, metadata during storage outage and sanitized failure responses. Validate official SDK discovery, then fresh-session native auth/capabilities and representative reads on deployment.
5. Keep writes disabled. A curated tracklist can be suggested with read access; creating a saved playlist additionally requires explicitly enabled writes and MCP/upstream write scopes. The previously verified connection was read-only, and current startup failure prevents refreshing its status.

## Research

MCP requires protected-resource metadata for authorization-server discovery: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/basic/authorization/authorization-server-discovery.mdx

Netlify documents automatic Blobs context in Functions and strong consistency: https://docs.netlify.com/build/data-and-storage/netlify-blobs/

These explain the integration boundaries; neither proves the underlying cause of this particular storage failure. Reauthentication is not a remedy for the reproduced metadata 502.
