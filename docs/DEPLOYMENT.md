# Deployment and operations

## Intended topology

Run one Node process behind an HTTPS reverse proxy, with one persistent private state directory and a separately managed encryption key. Bind the backend to loopback or a private container network. Do not expose its plain HTTP port publicly. `PUBLIC_ORIGIN` is an origin only: no path, query, credentials or fragment. The MCP resource is always that origin plus `/mcp`.

Example private `.env` values:

```dotenv
PUBLIC_ORIGIN=https://music.example.com
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

The first successful online install must produce a reviewed `package-lock.json`; commit it privately/publicly as appropriate and use `npm ci` on subsequent reproducible builds. The delivery environment could not create a genuine lockfile. Direct version pins alone do not pin transitive dependencies. Current runtime/container security patches and an image digest must be reviewed before deployment.

The supplied Dockerfile builds the UI, prunes development packages and runs as a non-root user. `compose.yaml` binds port 3000 only to host loopback, drops Linux capabilities and uses a named state volume. Set a real HTTPS `PUBLIC_ORIGIN` before using that compose file; combining its container bind address with a loopback public origin intentionally fails validation. Docker and reverse-proxy execution were not tested in the delivery environment.

## Netlify production

Netlify uses the official web-standard MCP transport after the shared HTTP authorization and body checks. Build the widget before function bundling, then deploy the verified output:

```sh
npm run verify
npm run test:browser
netlify deploy --prod --site e9643e19-7112-41d0-85b3-4befb549a972 --no-build --json
```

With Netlify CLI 27.10.2, `--context` requires `--build`; it cannot be combined with `--no-build`. Confirm the published deployment is ready, then test authenticated MCP tools. `/healthz` alone is not acceptance evidence. Keep `ENABLE_WRITES=false` and verify `tidal_auth_status.writesEnabled` before live reads.

The deployed `/widget.html` is a host-bridge component. Opening it as an ordinary browser page displays the host-required warning. A successful UI-resource read proves resource delivery; interactive host compatibility requires a real MCP Apps host rendering the resource and servicing a read action. See the separate follow-up [live validation report](LIVE_VALIDATION.md).

## Caddy example

```caddyfile
music.example.com {
    reverse_proxy 127.0.0.1:3005 {
        header_up Host music.example.com
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

On Netlify, the warm runtime refreshes its encrypted Blobs state with strong consistency before each request. Requests within one function instance are serialized to protect synchronous state reads; cross-instance writes retain whole-document CAS. This adds a storage read per request and favors correctness over throughput. Strong consistency alone does not refresh an already loaded in-memory snapshot.

The consent page permits form redirects to TIDAL's login origin and configured client callback origins. Chromium checks redirects against `form-action`, so restricting it to `self` prevents the login redirect after a successful, single-use consent submission. Restart authorization from the MCP client after a failed or expired flow; resubmitting consumed consent returns HTTP 400.

Stop the owning process cleanly before copying or changing state. Preserve `state.enc.json` and, separately, the exact encryption key. Copy `audit.jsonl` with an externally recorded last hash. Files are mode 0600 and the directory is 0700 on POSIX; review equivalent Windows ACLs yourself. Filesystem permissions do not protect against a compromised process or administrator.

A failed decrypt stops startup without loading plaintext. Never “repair” it by discarding the encryption check. Restore the correct backup/key pair. A stale `writer.lock` after a crash needs operator investigation: verify that no live process owns the directory before removing only that stale lock. Do not automate lock removal.

No unattended key rotation command is provided. The simplest safe rotation is deliberate disconnect/re-authorization into a fresh private state directory with a new key, after retaining required audit evidence and resolving any uncertain writes. Do not start a fresh profile to retry an unresolved write; first inspect its real TIDAL outcome. Key loss makes encrypted tokens unrecoverable.

## Retention and incidents

Periodic HTTP cleanup removes expired pending requests/codes/access, expired families, old closed/expired plans and orphaned grants where safe. Registration records remain so clients can reuse their identity. Audit logs do not auto-delete or rotate; define a retention schedule suitable for your use and keep a signed/externally stored checkpoint before rotating. The default store has no distributed transaction/audit coupling: crashes can leave gaps between a state change and its audit event.

For suspected compromise: disable writes, isolate the service, preserve state/audit/checkpoint evidence, revoke/disconnect local access, remove the app grant at TIDAL as needed, rotate developer secrets and the storage key, and reauthorize only after investigation. The hash chain detects changes relative to a trusted checkpoint; it is not proof against an administrator rewriting the whole chain.
