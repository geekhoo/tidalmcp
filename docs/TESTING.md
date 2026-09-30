# Testing and release gates

## Evidence classes

Do not mix these categories:

| Layer | Command / evidence | Delivery result |
|---|---|---|
| Syntax and CSS references | `npm run check` | Passed; no dependency imports/type checking implied |
| Core, authentication, HTTP and persistence | `npm test` | 65 passed, zero failed/skipped |
| Native coverage | `npm run test:coverage` | Recorded in `audit/logs/core-tests-coverage.log` |
| Chromium component checks | `CHROMIUM_EXECUTABLE=/usr/bin/chromium python tests/browser/run.py` | 18 checks passed in Chromium 144.0.7559.96 |
| npm dependencies | Online install required; offline attempt logged | Blocked: missing cache/package access |
| Production MCP Apps HTML | `npm run build` | Blocked: esbuild not installed |
| Official MCP/TIDAL SDK tests | `npm run test:mcp` | Command failed to load missing packages; no protocol assertions executed |
| Node Playwright component test | `npm run test:browser` | Supplied, not executed here; requires installed browser/dependencies |
| Real TIDAL / actual ChatGPT or Codex | Manual acceptance below | Not run |
| Dependency advisories and Docker | Online scan/build required | Not run |

The coverage report covers loaded modules and includes tests/fixtures. Its aggregate percentage is **not full-project coverage** and does not cover the unloaded MCP/TIDAL SDK adapter, production entry point, host bridge or deployment. Never quote the aggregate as a certification of those layers.

## Core suite

The 65 tests cover strict contracts, malformed/unknown inputs, JSON:API payloads, duplicate occurrence identity, collection resource routing, PKCE/state/browser/CSRF binding, resource/client separation, code and refresh replay, token expiry, single-flight TIDAL refresh, omitted rotated tokens, disconnect races, write permissions, exact digests, stale/cancelled/expired plans, idempotency recovery, concurrent commits, all eight actions, retry bounds, safe URL/cursor handling, response-size limits, authenticated encryption, file locks, transaction rollback, audit filtering/chain verification, design aliases and local HTTP OAuth behavior.

The HTTP tests use a real native Node server and browser-style cookies/redirects with a **synthetic upstream**, and a test-only handler after authorization. They prove that boundary's behavior, not MCP JSON-RPC negotiation. `tests/mcp/protocol.test.mjs` separately uses the actual official SDK client/server over stdio. `tests/mcp/tidal-sdk.test.mjs` checks the actual TIDAL SDK's request serialization with only its network replaced. Missing packages fail those tests rather than silently skipping them.

## Browser harness

The delivery environment's Chromium blocked ordinary localhost page navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. The browser policy was not altered. Component tests instead mounted the real UI source and semantic CSS in memory, then used an explicitly injected test adapter to the local synthetic HTTP service. The report states that boundary. It does not verify production ES-module asset delivery, the bundled official bridge, iframe permissions or ChatGPT/Codex rendering.

To reproduce with Python:

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser/run.py
```

To use an already installed browser, set `CHROMIUM_EXECUTABLE` to its path. The runner starts and stops its own loopback demo on port 3017. It checks display, empty state, selection, preview/cancel, modal validation, explicit application, owned-list updates, mobile width, keyboard focus, safe text/links, inline mode and host-originated pagination. It records actual screenshots. It does not need TIDAL credentials.

## Mandatory online/deployment acceptance

1. Install declared packages from trusted registries, preserve/review the generated lock, and run syntax, core, production bundle, official SDK tests and browser tests. Inspect all advisory results. Fix, do not bypass, failures.
2. Register a test developer app/callback and approved scopes. Keep writes disabled. Complete real OAuth in the desired MCP client. Verify protected-resource discovery, DCR, exact callbacks, consent, denied consent, token expiry/refresh and local disconnect. Confirm a TIDAL token is rejected as an MCP token.
3. Read a known catalogue item, page a search, inspect included artwork/artists and verify market handling. Read your profile, owned playlists and all saved collection kinds. Check raw document fidelity and upstream error handling. Record schema/package/client versions and redact captured fixtures.
4. Enable writes only for a test account, reconnect and obtain explicit human approval. Create a clearly labelled unlisted canary playlist, inspect its visibility, add the same chosen track twice, remove only one returned occurrence, move an occurrence relative to another, edit the canary name, then explicitly approve deletion. Save/remove one disposable collection item only when restoration expectations are understood. Record actual partial-success metadata.
5. Test two separate users and two separate clients against one HTTP process; confirm no data or preview crossing. Test lost/replayed local refresh tokens, upstream revocation, cancelled consent, stale preview and a simulated network loss without changing the idempotency identity.
6. Exercise the production UI in each intended MCP Apps host and the text-only flow in a non-UI client. Confirm approval-gated tool arguments, popup/fullscreen rejection, resource caching, CSP, safe links and reconnect UX. Complete a manual keyboard/screen-reader review.
7. Validate TLS, private backend binding, Host/Origin handling, proxy log redaction, storage permissions, graceful shutdown, backup/restore, stale locks, audit checkpoints and release rollback. Only then accept the deployment for its stated user population.

No test or script automatically runs this live mutation canary. Supplying credentials must not unexpectedly change a real account.

## Verify the included synthetic audit trace

```sh
node scripts/verify-audit.mjs audit/runtime-example.synthetic.jsonl
```

The three-record trace was produced by real service calls against the in-memory synthetic fixture: search, prepare a playlist, and confirm the synthetic change. It is not evidence of live TIDAL activity. `scripts/audit-example.mjs` reproduces this flow and refuses to overwrite existing evidence. Preserve the delivered trace before explicitly removing it to run a new demonstration.
