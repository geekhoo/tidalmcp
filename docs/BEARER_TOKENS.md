# Per-agent bearer tokens

Investigated and implemented 19 October 2026. The requested model is one token per agent, all linked to the operator's existing TIDAL account. OAuth remains available for clients connecting their own accounts.

## Findings and design

The server already accepts `Authorization: Bearer` with locally issued OAuth access tokens. Those access tokens expire after 15 minutes and use rotating refresh tokens. A manually configured agent needs an operator-issued credential with an explicit lifetime instead of copying a short-lived OAuth token.

MCP requires bearer credentials in the request header, validation for the intended resource, and rejection of invalid or expired tokens. TIDAL credentials must stay separate; never paste an upstream TIDAL token into an MCP client. See the [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) and [token-passthrough guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices#token-passthrough).

This implementation is an operator-provisioned credential extension alongside OAuth, not a new OAuth grant. No password, client-credentials or token-issuing MCP tool was added. `AgentTokens` creates opaque random credentials using the existing hashed access-token and family tables; `OAuthBroker.verify` remains the shared verification path. Official MCP transports and TIDAL SDK integration are retained. The [SDK authorization guide](https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization) describes the verified principal boundary; its latest examples are not assumed to match every API in this repository's pinned SDK.

- `ENABLE_AGENT_TOKENS=true` enables creation/verification. Default is false in `.env.example`; the active-service Compose override enables it. Set it false in Compose to reject all agent tokens while leaving OAuth available.
- Each token has its own client identity, exact MCP resource, TIDAL grant, explicit scopes and expiry. Secrets are random 256-bit values; only SHA-256 hashes enter encrypted state. The operator's private delivery file necessarily contains the raw secret.
- Lifetimes default to 30 days, with a maximum of 90 days. Agent tokens have no refresh token. Existing OAuth lifetimes are unchanged. Upstream TIDAL refresh continues through the stored account grant.
- Rotation invalidates the previous secret and retains the client identity, including ownership of existing previews. Rotation cannot revive a revoked or expired token or expand its scopes.
- Revoke one agent without affecting others. Disconnecting the shared TIDAL grant invalidates every token linked to that grant. Token issuance never silently selects an account or upgrades upstream permissions.
- Write scopes require existing upstream permissions and `ENABLE_WRITES=true`; each actual mutation still requires approval of its exact preview. A token does not prove human approval.

## Operator management

Use `npm run access-tokens -- --help` for the CLI. It loads `.env` when present and supports `grants`, `list`, `create`, `rotate`, `revoke` and `delete`. `grants` lists safe account references and subject hashes; it does not print upstream tokens or profile attributes. `list` prints token metadata, never secrets.

For interactive management, stop the owning server and run `npm run access-tokens` in a terminal (or `npm run access-tokens -- interactive`). The numbered menu offers create, list, revoke and delete. It lists active linked grants by account fingerprint and link date; choose one, then enter the agent name, permissions, lifetime and private file path. Token selection uses names, status and expiry. Create/revoke/delete require confirmation, defaulting to cancellation. Choosing `0` goes back or exits; Ctrl+C exits. The server is not restarted automatically.

On Fedora, use a terminal and omit `-T` so Compose preserves interactive input:

```sh
cd ~/tidal-mcp-app
docker compose stop tidal-mcp
docker compose run --rm --no-deps tidal-mcp npm run access-tokens
docker compose up -d tidal-mcp
```

The default private output is a unique file under `DATA_DIR` (`/data` in Compose). Secrets are never displayed. Without a terminal, invoking the CLI with no arguments prints help; explicit interactive mode reports that a terminal is required. Scripted commands below continue to work without a terminal.

For a local installation, stop the owning server, then run:

```sh
npm run access-tokens -- grants
npm run access-tokens -- list
npm run access-tokens -- create --grant ACTUAL_GRANT_ID --name my-agent --scopes tidal:read,tidal:write --out /absolute/private/my-agent.token
npm run access-tokens -- revoke ACTUAL_TOKEN_ID
npm run access-tokens -- delete ACTUAL_TOKEN_ID
```

Use the ID returned by `create` or `list`, not the secret. `revoke` disables the credential while retaining its list entry. `delete` also removes its stored credential records and list entry, immediately invalidating an active token. Both preserve linked accounts, music, audit history and mutation recovery records. Neither deletes private delivery files; remove those separately when no longer needed. The older `--id ID` syntax remains supported. Restart the owning server after management.

**Stop the owning server before running this CLI.** The encrypted state directory is single-writer; do not remove its writer lock to force access. The CLI must use the same state directory, encryption key and public origin as the HTTP service. It performs no upstream requests and does not initiate TIDAL login.

On Fedora, from `~/tidal-mcp-app`, after building the updated image:

```sh
docker compose stop tidal-mcp
docker compose run --rm --no-deps -T tidal-mcp node scripts/agent-token.mjs grants
docker compose run --rm --no-deps -T tidal-mcp node scripts/agent-token.mjs create \
  --grant ACTUAL_GRANT_ID --name dot --scopes tidal:read,tidal:write \
  --days 30 --out /data/dot-agent.token
docker compose up -d tidal-mcp
```

The output file must be an absolute private path in a writable directory, such as `/data` in Compose. Existing files are never overwritten. New files use mode 0600; enforce equivalent Windows ACLs when copying to Windows. Only metadata and the file path are printed. Deliver the secret through a private file or secret manager; never put it into chat, source control, screenshots or logs. Keep private backups of encrypted state and the encryption key separately before changing deployment state.

For later maintenance, stop the service first and use the same `docker compose run` prefix:

```sh
node scripts/agent-token.mjs list
node scripts/agent-token.mjs rotate --id ACTUAL_TOKEN_ID --days 30 --out /data/dot-agent-new.token
node scripts/agent-token.mjs revoke --id ACTUAL_TOKEN_ID
```

Restart the service afterward. Creating/rotating credentials can fail if private-file delivery or persistence fails; inspect metadata before retrying. Do not replace an uncertain music mutation with a new preview during token maintenance.

## Client setup

Load the privately delivered secret into `TIDAL_MCP_TOKEN` using the client's secret manager or launch environment, then configure its Streamable HTTP connection. The secret belongs in the header on every MCP request:

```http
Authorization: Bearer <privately supplied MCP agent token>
```

For Codex, the supported configuration is:

```toml
[mcp_servers.tidal]
url = "https://tidal.pippinpuffin.com/mcp"
bearer_token_env_var = "TIDAL_MCP_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 120
```

See [official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The running client must inherit the environment variable; setting it in an unrelated terminal does not update an already-running desktop app. Reload/restart the client after configuration changes. This operator-issued-token path does not require the agent to perform DCR or a browser callback. The operator's linked TIDAL account still requires valid upstream authorization.

For other agents, use their documented HTTP header/secret configuration. Compatibility requires support for custom bearer credentials; OAuth-only clients should continue using OAuth. No universal configuration file or automatic MCP Apps rendering is promised.

Verify with `tidal_auth_status({})`, `tidal_capabilities({})`, then one `tidal_search` call. Inspect actual tool results, not just health or configuration. The [agent quick start](AGENT_QUICKSTART.md) supplies an access-check prompt and example music requests.

## Validation boundary

Core tests cover hashing, expiry, resource binding, feature disablement, per-agent revocation, shared-account disconnect, scope/lifetime validation, preview isolation, rotation, pruning, native HTTP rejection and CLI private-file/persistence/locking behavior. An official SDK test exercises a bearer client through the shared web transport. Live validation must separately confirm the Fedora native HTTP service using the issued secret; no real music mutation is required to validate authentication.

Executed local, Fedora and live results, request IDs and rollback notes are recorded in [BEARER_TOKEN_VALIDATION.md](BEARER_TOKEN_VALIDATION.md).

The dependency audit found [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h) in the original MCP client pin. The client/core/server packages were updated together to 2.3.1 and the Node transport to its compatible 2.1.1 version; MCP Apps remains 2.0.3 and TIDAL API SDK remains 0.47.0. The reviewed advisory concerns OAuth clients, not SDK servers. The updated lockfile passed the production dependency audit with zero vulnerabilities reported at validation time.
