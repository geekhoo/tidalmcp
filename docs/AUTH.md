# Authentication and token lifecycle

## Two unrelated bearer-token domains

The **MCP token** authorizes an agent to this server. The **TIDAL token** authorizes this server to TIDAL. They are never interchangeable. Passing a TIDAL token as the `/mcp` bearer token fails local verification. MCP tokens contain no TIDAL credentials and are stored only as hashes in token lookup tables; the backing state file is itself encrypted.

The server advertises public-client DCR with `token_endpoint_auth_method=none` and S256 PKCE. It does not advertise CIMD, private-key JWT client authentication, OIDC ID tokens, UserInfo, password grants, agent client-credentials grants or custom API-key login. A client requiring one of those unsupported features needs a compatible configuration or a different authorization front end.

## Exact URLs and registration

| URL | Registered/used by | Purpose |
|---|---|---|
| `https://tidal.pippinpuffin.com/mcp` | MCP client | Protected resource and tool endpoint |
| `https://tidal.pippinpuffin.com/tidal/callback` | TIDAL developer app | Returns the upstream TIDAL authorization code to this server |
| The agent's exact callback URI | `OAUTH_REDIRECT_ALLOWLIST`, then DCR | Returns this server's own authorization code to the agent |
| `http://127.0.0.1:8765/callback` | TIDAL app, for local login where permitted | Bootstraps a local stdio profile |

These are the active Fedora service URLs; substitute your own origin for a separate installation. Netlify is deprecated for new connections. Hosted clients use OAuth without handling the server's developer credentials; see [CLIENTS.md](CLIENTS.md) for setup and migration.

Do not register the MCP endpoint as the TIDAL callback. Do not put a ChatGPT/Codex callback in the TIDAL developer app. Do not wildcard callbacks. Each DCR client may register one to five exact operator-approved URIs. The authorization request and code exchange must use the registered URI verbatim. Existing registrations are retained across restart.

## Remote sequence implemented here

1. The client calls `/mcp` without an acceptable bearer token. The server responds with 401 and a protected-resource metadata challenge. Discovery resolves the resource and local authorization-server endpoints.
2. DCR registers an approved callback. The client creates its own PKCE verifier/challenge and calls `/authorize` with `client_id`, `redirect_uri`, `resource`, `state`, `response_type=code`, scopes and S256 challenge.
3. The broker binds that request to a ten-minute browser cookie and CSRF secret. A local consent page displays the requesting client, permissions and callback. The client name is escaped and no scripts are loaded.
4. After explicit consent, the broker creates a separate TIDAL PKCE verifier and state. The user authenticates directly at TIDAL; this server never asks for a TIDAL password.
5. The TIDAL callback requires the original browser cookie, valid state and an unexpired pending record. It consumes state before exchanging the upstream code. It verifies `/users/me`, stores a separate TIDAL grant, and issues a new local authorization code to the original agent callback.
6. `/token` verifies the agent PKCE proof, client, redirect and exact resource. The local code is single-use. The resulting MCP access and refresh tokens are random opaque values, not TIDAL tokens.
7. Every MCP request checks token hash, expiry, resource, token family, current grant and read permission before reaching the official SDK. Write policy is checked again within the service.

All direct HTTPS upstream calls have fixed destinations and reject redirects. Browser consent cookies are HttpOnly and SameSite=Lax; HTTPS uses the `__Host-` prefix and Secure flag. Consent POST additionally requires the configured same-origin Origin header. Origin and Host validation do not trust caller-supplied forwarded headers.

## Local policy values

| Record | Policy |
|---|---|
| Pending consent/upstream login | 10 minutes, one-use state, browser-bound |
| MCP authorization code | 5 minutes, one-use, S256-bound |
| MCP access token | 15 minutes, never beyond family expiry |
| MCP refresh family | 30-day absolute maximum; refresh rotates and cannot extend the absolute deadline |
| TIDAL access token | Uses the upstream `expires_in`; refresh starts within a 30-second margin |
| TIDAL refresh token | Follows the upstream response/revocation behavior; no invented lifetime |
| Write preview | 5 minutes before first application |
| Uncertain-write retry | 55 minutes from first execution, same key/payload only |

These are this application's policy choices except where an upstream response controls expiry. They are not universal TIDAL or MCP defaults.

## Scopes and elevation

The active `tidal.pippinpuffin.com` endpoint defaults to writes enabled and client login with `tidal:read,tidal:write`. A deliberately read-only client can request only `tidal:read`; every mutation still needs exact-preview approval.

MCP `tidal:read` maps to the account's read workflows. The TIDAL authorization request contains `user.read`, `collection.read`, `playlists.read` and `search.read`. MCP `tidal:write` is advertised only when the operator enables writes and requests `collection.write` and `playlists.write` upstream. The tool that actually performs an operation still checks its required scope. Legacy/internal scope names are not requested just because they appear in a published schema security array.

Changing `ENABLE_WRITES` does not retrospectively upgrade a token. Restart and reconnect; a refresh cannot broaden an existing family. Reduced scopes remain reduced for that family. Dropping the required read scope is rejected. A 403 can also reflect access-tier, account, resource or territory restrictions, not merely an expired token.

## Refresh, revocation and races

TIDAL refresh is single-flight per grant. Concurrent readers share the refresh promise. If TIDAL omits a replacement refresh token, the prior one is preserved; if TIDAL reports `invalid_grant`, local upstream credentials are cleared and the account must reconnect. A refresh finishing after disconnect cannot recreate a deleted grant.

MCP refresh tokens rotate on every use. Reuse of a consumed refresh token revokes the family, including its newly issued access token. Client and resource binding also apply to refresh. Unknown revocation requests do not reveal whether a token existed. Disconnect erases the local grant and its plans/profiles/access, and revokes associated MCP families. This does **not** claim to revoke the authorization grant at TIDAL; use TIDAL account controls for that separate action.

## Deployment limitations

State cleanup runs periodically in HTTP mode. A single stdio process has a smaller lifecycle and no background server maintenance loop. The state store is small-scale and single-writer. Rate limits use the TCP peer address; behind a reverse proxy multiple users can share one conservative authorization-rate bucket. No high-availability, multi-region token replication or organization-domain OIDC restriction feature is implemented.

OAuth standards alignment is not an independent certification. Core state-machine and HTTP tests passed with a synthetic upstream, but real agent/TIDAL exchanges and a public-service authorization review are required before rollout. Official references are in [SOURCES.md](SOURCES.md).
