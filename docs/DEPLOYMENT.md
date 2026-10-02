# Deployment and operations

## Active service

Use **`https://tidal.pippinpuffin.com/mcp`** for client installation and usage; see [CLIENTS.md](CLIENTS.md). The active service defaults to write-enabled access and client authorization with `tidal:read,tidal:write`; exact-preview approval remains mandatory for each mutation. The active service is a single Docker Compose container on Fedora at `/home/geek/tidal-mcp-app`, behind Caddy. Netlify at `tidalmcp.netlify.app` is deprecated for new connections and deployment. Its adapter remains in source for compatibility and historical evidence.

## Intended topology

Run one Node process behind an HTTPS reverse proxy, with one persistent private state directory and a separately managed encryption key. Bind the backend to loopback or a private container network. Do not expose its plain HTTP port publicly. `PUBLIC_ORIGIN` is an origin only: no path, query, credentials or fragment. The MCP resource is always that origin plus `/mcp`.

Example private `.env` values for a separate new installation (substitute its domain; the active service keeps writes enabled):

```dotenv
PUBLIC_ORIGIN=https://tidal.pippinpuffin.com
LISTEN_HOST=127.0.0.1
PORT=3000
DATA_DIR=/srv/tidal-mcp/private-state
DEFAULT_COUNTRY=SG
ENABLE_WRITES=false
OAUTH_REDIRECT_ALLOWLIST=https://chatgpt.com/connector/oauth/REAL_CALLBACK_ID
ALLOWED_ORIGINS=
```

Add real TIDAL developer credentials and a generated 32-byte base64 encryption key through your secret manager or a protected local environment file. Do not commit that file. Choose a market that is valid for your application/account; the example is not an entitlement override.

## Build and start

```sh
npm install
npm run verify
npm run test:browser
npm audit --omit=dev --audit-level=high
npm start
```

The first successful online install must produce a reviewed `package-lock.json`; commit it privately/publicly as appropriate and use `npm ci` on subsequent reproducible builds. The original delivery environment could not create a genuine lockfile; the 1 October follow-up retained and reviewed one. See [SELF_HOST_VALIDATION.md](SELF_HOST_VALIDATION.md) for subsequent execution evidence. Direct version pins alone do not pin transitive dependencies. Current runtime/container security patches and an image digest must be reviewed before deployment.

The supplied Dockerfile builds the UI, prunes development packages and runs as a non-root user. `compose.yaml` maps container port 3000 to host-loopback port 3005, drops Linux capabilities and uses a named state volume. Set a real HTTPS `PUBLIC_ORIGIN` before using that compose file; combining its container bind address with a loopback public origin intentionally fails validation. The original delivery environment did not test Docker/proxy execution; subsequent Fedora execution is recorded in [SELF_HOST_VALIDATION.md](SELF_HOST_VALIDATION.md).

## Fedora Compose operations

Keep the existing endpoint write-enabled as requested. For a separate new installation, configure protected `.env` credentials/key and exact callbacks before startup. Set `ENABLE_WRITES: "false"` in `compose.yaml` for initial validation: its checked-in `"true"` override reflects a prior approved canary and takes precedence over `.env`. Do not copy that approval to another account or write workflow.

On the Fedora host, from `/home/geek/tidal-mcp-app`:

```sh
docker compose config -q
docker compose up -d --build
docker compose ps
curl --fail --silent --show-error -H 'Host: tidal.pippinpuffin.com' http://127.0.0.1:3005/healthz
curl --fail --silent --show-error https://tidal.pippinpuffin.com/healthz
curl --fail --silent --show-error https://tidal.pippinpuffin.com/.well-known/oauth-protected-resource/mcp
curl --fail --silent --show-error https://tidal.pippinpuffin.com/.well-known/oauth-authorization-server
```

Use SSH to run these commands on Fedora when operating from another machine. The commands upgrade this Compose service; retain its named `tidal-state` volume and encryption key. Do not use `down -v` or globally prune/restart co-hosted services. Confirm Caddy preserves the configured Host and OAuth/MCP headers. Then test the authenticated client with `tidal_auth_status` and `tidal_capabilities` and a read-only search. Health/discovery alone are not live TIDAL acceptance.

`/widget.html` is a host-bridge component. An ordinary browser page displays the host-required warning. Resource delivery does not establish interactive compatibility; validate a real MCP Apps host read action or use text/JSON tools. See [SELF_HOST_VALIDATION.md](SELF_HOST_VALIDATION.md) for the recorded Fedora/Codex result.

## Deprecated Netlify adapter

Do not use Netlify for a new installation or as an automatic fallback. [LIVE_VALIDATION.md](LIVE_VALIDATION.md), [MCP_USAGE_AND_UI.md](MCP_USAGE_AND_UI.md), and [OAUTH_DISCOVERY_INCIDENT.md](OAUTH_DISCOVERY_INCIDENT.md) retain dated Netlify evidence. Their URLs/results describe the original observations, not the active service. Client migration is documented in [CLIENTS.md](CLIENTS.md); changing a URL does not migrate encrypted server state or make tokens portable between protected resources.

The retained function uses the web-standard MCP transport with the shared HTTP authorization/body checks. It requires a built widget before function bundling and uses encrypted Blobs state with strong reads and whole-document CAS. Retain these invariants when maintaining the deprecated adapter.

## Caddy example

```caddyfile
tidal.pippinpuffin.com {
    reverse_proxy 127.0.0.1:3005 {
        header_up Host tidal.pippinpuffin.com
    }
}
```

Use your actual domain consistently. The backend compares Host against `PUBLIC_ORIGIN`, and does not trust arbitrary `X-Forwarded-Host`. Preserve Authorization, Content-Type, Accept and MCP protocol headers. Do not add a second Basic-auth wall in front of MCP/OAuth discovery unless the client supports it. TLS termination and public DNS are deployment prerequisites, not supplied services.

Do not enable access logs that retain `/authorize` or `/tidal/callback` query strings. Redact authorization/cookie headers and OAuth code/state parameters. The application's own HTTP audit records only the route template, not the query. No wildcard CORS setting is required for the MCP Apps component because its calls use the host bridge.

## Health and limits

The current Compose stack uses `PUBLIC_ORIGIN=https://tidal.pippinpuffin.com` and maps host-loopback port `3005` to container port `3000`. Host Caddy uses `127.0.0.1:3005`; containerized Caddy on a shared network uses `tidal-mcp:3000`. The TIDAL callback is `https://tidal.pippinpuffin.com/tidal/callback`; MCP client callbacks separately belong in `OAUTH_REDIRECT_ALLOWLIST`. Run exactly one replica per state volume and preserve its encryption key. Never use `docker compose down -v` for ordinary upgrades.

`GET /healthz` reports process liveness only; it does not exercise TIDAL, tokens, application approval or write permissions. The request still needs the expected Host header when sent through loopback. API response reads are bounded at 2 MiB, HTTP bodies at 128 KiB, and each upstream request has a 15-second timeout. A read can include refresh and bounded retries, so allow enough client tool time without enabling infinite waits.

The broker caps active registrations and pending requests and rate-limits authorization endpoints. Behind a proxy, callers can share the proxy's TCP-peer bucket. Apply network-level rate/concurrency controls appropriate to your deployment. The package is not a horizontally scalable authorization service; whole-state encrypted transactions and synchronous audit appends favor auditability over throughput.

## State backup, restore and key rotation

In the deprecated Netlify adapter, the warm runtime refreshes its encrypted Blobs state with strong consistency before each request. Requests within one function instance are serialized to protect synchronous state reads; cross-instance writes retain whole-document CAS. This adds a storage read per request and favors correctness over throughput. Strong consistency alone does not refresh an already loaded in-memory snapshot.

The consent page permits form redirects to TIDAL's login origin and configured client callback origins. Chromium checks redirects against `form-action`, so restricting it to `self` prevents the login redirect after a successful, single-use consent submission. Restart authorization from the MCP client after a failed or expired flow; resubmitting consumed consent returns HTTP 400.

Stop the owning process cleanly before copying or changing state. Preserve `state.enc.json` and, separately, the exact encryption key. Copy `audit.jsonl` with an externally recorded last hash. Files are mode 0600 and the directory is 0700 on POSIX; review equivalent Windows ACLs yourself. Filesystem permissions do not protect against a compromised process or administrator.

A failed decrypt stops startup without loading plaintext. Never “repair” it by discarding the encryption check. Restore the correct backup/key pair. A stale `writer.lock` after a crash needs operator investigation: verify that no live process owns the directory before removing only that stale lock. Do not automate lock removal.

No unattended key rotation command is provided. The simplest safe rotation is deliberate disconnect/re-authorization into a fresh private state directory with a new key, after retaining required audit evidence and resolving any uncertain writes. Do not start a fresh profile to retry an unresolved write; first inspect its real TIDAL outcome. Key loss makes encrypted tokens unrecoverable.

## Retention and incidents

Periodic HTTP cleanup removes expired pending requests/codes/access, expired families, old closed/expired plans and orphaned grants where safe. Registration records remain so clients can reuse their identity. Audit logs do not auto-delete or rotate; define a retention schedule suitable for your use and keep a signed/externally stored checkpoint before rotating. The default store has no distributed transaction/audit coupling: crashes can leave gaps between a state change and its audit event.

For suspected compromise: disable writes, isolate the service, preserve state/audit/checkpoint evidence, revoke/disconnect local access, remove the app grant at TIDAL as needed, rotate developer secrets and the storage key, and reauthorize only after investigation. The hash chain detects changes relative to a trusted checkpoint; it is not proof against an administrator rewriting the whole chain.
