# Security review and threat model

**Scope:** source review and executed synthetic tests for this package, not a penetration test, certification or production approval. Pending SDK/live/advisory gates are release blockers, not waived requirements.

## Assets and trust boundaries

Assets include TIDAL access/refresh tokens, developer credentials, MCP token families, current-user identity, write previews/idempotency keys, playlist/library content and audit evidence. Trust boundaries are agent → MCP resource, browser → OAuth broker, broker → TIDAL, tool service → encrypted store, and sandboxed UI → host tool bridge. The user's filesystem/secret manager and chosen agent host remain trusted administrative components.

| Threat | Implemented control | Residual limitation |
|---|---|---|
| Token passthrough / audience confusion | Distinct locally issued MCP tokens, exact resource binding, TIDAL token never returned | Endpoint/SDK/live interoperability still needs external validation |
| Code interception or substitution | S256 on both OAuth legs, code/client/redirect/resource binding, short one-use records | A compromised host or local machine remains powerful |
| Login CSRF / confused deputy | Explicit client consent, browser-bound cookie, CSRF token, state and callback validation | The person must recognize and trust the requesting client |
| Cross-user tool execution | Principal derived from verified MCP token; per-request closure; `me` for account collections | Upstream permissions remain authoritative; multi-user live tests pending |
| Refresh replay | Hash lookup, rotating local refresh tokens, family revocation on reuse | Retaining used-token tombstones consumes state until family expiry |
| Data loss/duplicate writes | Exact previews, expiry, account/client binding, persisted idempotency identity | Preflight is not an atomic lock; remote concurrent changes remain possible |
| Ambiguous write result | Persist executing before I/O, recover as unknown, reuse same key/window | After the retry window, an operator/user must reconcile actual state |
| SSRF / credential exfiltration | Fixed upstream origins/routes, no arbitrary proxy tool, safe cursor extraction, redirect rejection | Direct external artwork links still disclose normal image-request metadata to allowed TIDAL CDNs |
| Prompt injection in music metadata | Treat results as data; static instructions; no tool command generation from metadata | No claim that all model/host prompt-injection behavior is prevented |
| HTML/script injection | `textContent` for dynamic strings, URL checks, no external script CDN | Actual host CSP/bridge and production bundle testing remain pending |
| Secrets in storage/logging | AES-256-GCM state, random nonces, restrictive permissions, metadata-only audit | Secrets exist in process memory; `.env` requires separate protection |
| DNS rebinding / browser abuse | Exact Host/Origin checks, no wildcard CORS, bounded body, consent-origin check | Reverse proxy must preserve configured Host and keep backend private |
| Supply-chain compromise | Direct dependency pins, source evidence, isolated package entry points | No installed transitive lock or advisory scan was available here |

## Approval is a host responsibility as well as a server policy

The server can verify that a commit matches a prepared payload and a permitted account. It cannot prove that `confirm: true` came from a human rather than an autonomous model. The UI's explicit button is tested, and destructive tool annotations/request descriptions guide hosts, but annotations are not enforcement. Disable unattended write approvals in the host and keep `ENABLE_WRITES=false` until the host's approval policy is validated. For unattended production agents requiring stronger guarantees, add an out-of-band, independently authenticated approval service; that service is not part of this implementation.

## Secure defaults and deliberate gaps

The server does not expose an unauthenticated production music proxy. HTTP requires MCP OAuth, including for catalogue tools; stdio trusts its local process environment. Writes require operator opt-in, a write-capable MCP principal, an available TIDAL grant and the operation's upstream scope. An upstream refresh may happen for a read, but writes are not automatically repeated after failure. Tokens do not appear in tool results, resources or browser state.

The custom authorization server supports the chosen public-client DCR flow only. It does not implement enterprise OIDC claims, CIMD fetching, private-key JWT validation, machine-to-machine agent grants or external IdP integration. These omissions are advertised honestly and avoid unused network/parser surfaces. An independent OAuth review or migration to an established provider is required before an internet-facing service with many users.

## Hardening before public rollout

Resolve the SDK build/protocol tests and dependency advisory scan first. Retain an immutable lockfile and reviewed image digest. Exercise real TIDAL scopes and all selected routes against a test account; get application approval rather than expanding internal scopes. Validate callback registration and consent in actual ChatGPT/Codex hosts, including denied consent, revoked access, concurrent refresh and different users. Configure TLS, private backend reachability, proxy log redaction, rate/concurrency controls, encrypted backups and external audit checkpoints. Review privacy, TIDAL terms and public distribution requirements with the responsible operator.

## Disclosure / triage

There is no live support service or security mailbox bundled. Report issues to the operator/repository maintainer you deploy under. Include a request ID, tool/action and sanitized reproduction; exclude tokens, OAuth callback query strings, private playlists, raw `.env` contents and encryption keys. Preserve the same plan ID for an uncertain write until its outcome is understood.
