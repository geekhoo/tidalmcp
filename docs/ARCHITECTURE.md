# Architecture

## Boundaries

```text
MCP client / agent                          MCP Apps-capable host
       | stdio OR HTTPS + MCP token              | sandboxed UI resource
       |                                         | host tools/call bridge
       +----------------------+------------------+
                              v
            Official MCP SDK tools and transports
                              |
                 Per-request trusted principal
                              |
      Strict contracts -> TidalService -> change-plan state machine
                              |
                 TidalClient policy boundary
        scopes / timeouts / bounded reads / retry rules
                              |
               Official @tidal-music/api adapter
                              |
                   Fixed TIDAL HTTPS API

Agent OAuth -> local authorization broker -> encrypted state
                          |
                 TIDAL OAuth + PKCE
                          |
              server-held TIDAL user grant
```

These are software-boundary diagrams, not deployment claims. The UI makes no direct TIDAL API requests and receives no TIDAL token. It communicates through the official MCP Apps bridge. The standalone demo uses a separately injected synthetic adapter, never the production MCP endpoint.

## Responsibilities

| Module | Owns | Must not own |
|---|---|---|
| `contracts.mjs`, `schema.mjs` | Closed input shapes, bounds, supported actions and relationships | Authentication, network I/O, arbitrary JSON proxying |
| `oauth.mjs` | Agent registration, consent, code/refresh/access lifecycles | Forwarding a TIDAL bearer token to an agent |
| `upstream-auth.mjs` | TIDAL OAuth, identity verification, single-flight refresh | Trusting a user ID supplied by the caller |
| `store.mjs` | Encrypted atomic persistence and exclusive writer lock | Multi-process database semantics |
| `tidal-client.mjs` | Fixed-origin access, read retries, bounded data, normalized output | Inventing media access or silently retrying writes |
| `plans.mjs` | Exact previews, approval digests, idempotency and uncertain outcomes | Deciding that a user approved a change |
| `service.mjs` | Account-scoped tool dispatch and normalized envelopes | Rendering HTML or generating agent instructions from catalogue text |
| `src/mcp/server.mjs` | Official SDK tool/resource registration and metadata | Reimplementing JSON-RPC or MCP transport framing |
| `web/ui.mjs` | DOM rendering and explicit user interactions | Holding credentials or broad network capabilities |

## Runtime choices and trade-offs

**Official SDK, not an MCP-like custom protocol.** Production transports, negotiation, tool schemas and MCP Apps registration use the official libraries. The native HTTP layer handles authorization and delegates an authenticated POST to `NodeStreamableHTTPServerTransport`. Netlify runs the same HTTP checks through the web adapter, then passes the original `Request`, parsed JSON and verified `authInfo` to `WebStandardStreamableHTTPServerTransport`. A new SDK server/transport is created per request, with a principal closure, avoiding cross-account mutable session state. No server-side SSE subscription or session resumption is implemented. GET and DELETE on `/mcp` return 405; stateless POST/JSON is the intended transport mode.

**JavaScript ESM with strict boundary validation.** Native modules let the core run and be tested without transpilation. The JSON-schema subset is intentionally small and reviewed: objects, strict property checks, strings, integers, booleans, enums/constants, arrays and alternatives. The same descriptors compile to Zod for MCP. Upstream TypeScript schemas remain available through the TIDAL dependency. This is runtime validation, not a claim of comprehensive static type coverage.

**Server-side OAuth broker.** TIDAL's browser Auth SDK is not placed in the agent UI; that would put account credentials in a browser component and couple identity to each host. Instead, a server-side provider implements the documented OAuth exchanges and feeds the official API SDK through its credentials-provider boundary. The custom authorization broker adds review burden and is a release gate, especially for a public multi-tenant service. An established identity provider should replace the MCP-facing broker before broader organizational use when its operational/security features are required; that integration is not implemented here.

**Small single-writer encrypted store.** Atomic whole-state writes give inspectable behavior without external database infrastructure. They also impose O(state-size) serialization, a single process, retained token-family records and limited scale. Do not horizontally replicate this directory. For larger deployments, replace `MemoryStore/EncryptedStore` behind their synchronous transaction boundary with an appropriately redesigned transactional store; simply pointing several processes at the same file is unsafe.

**One transaction coordinator for writes.** Models and UI both use the same prepare/commit state machine. Action-specific business payloads are compiled centrally rather than allowing an agent to supply arbitrary methods, URLs, headers or bodies.

## UI resource lifecycle

`npm run build` bundles the official MCP Apps client and component into one HTML file, with generated token CSS inline. The resource URI includes a content hash; changed HTML/CSS/JavaScript gets a new cache key. Selected read/preview tools carry `_meta.ui.resourceUri`, and compatibility metadata is additive. Commit/status tools remain data-only to avoid redundant rendering. This is a pragmatic selected-tool rendering design, not a separate render-only tool layer.

The component registers host event handlers before connecting. It uses `callServerTool`, `openLink` and user-requested fullscreen mode. Six rows are shown in inline mode; full mode adds navigation and editing. Fullscreen rejection leaves text/JSON workflows available. Host-delivered first pages include their originating read arguments so pagination can reconstruct the same operation. No browser fetch to TIDAL or external script CDN is permitted.

## Failure behavior

Expected errors produce stable safe codes and a request ID. Untrusted upstream error text is not copied into operational error messages. GET retries are bounded; writes with uncertain outcomes keep the same persisted plan and idempotency key. A crash with an executing plan is recovered as `unknown`, not as a fresh operation. Audit entries record routes, codes, timings and hashed principals, not queries, tokens or payloads. Infrastructure errors that prevent safe state/audit operation must be investigated rather than suppressed.
