# TIDAL MCP App

**Source package 1.0.0 · reviewed 30 September 2026**

A TIDAL catalogue, saved-music and playlist integration for MCP-compatible agents, with an optional MCP Apps music workspace. It uses the official MCP SDK v2, the official MCP Apps extension, and the official TIDAL API SDK. The application is JavaScript ES modules on Node.js; it provides strict runtime contracts and TypeScript declaration exports. The UI is framework-independent HTML, CSS and JavaScript.

## Delivery status — read this first

The source, fictional-data demo, documentation, executable tests and audit evidence are included. **65 dependency-free core tests and 18 Chromium component checks passed in the delivery environment.** The core tests include real local HTTP OAuth flows backed by a synthetic TIDAL service.

**Production SDK installation, production UI bundling, SDK protocol tests, vulnerability advisory checks, live TIDAL authorization and hosted ChatGPT/Codex verification remain unverified.** npm downloads were unavailable here; the attempted install failed with `ENOTCACHED`, and the SDK/build commands failed because their dependencies were absent. They are not marked as passed or skipped. See [audit/REPORT.md](audit/REPORT.md) and its raw logs.

There is no fabricated package lock, built SDK bundle, deployment URL, TIDAL credential or production certification. Exact direct dependencies are pinned; install them online, retain the generated `package-lock.json`, and pass the release gates before deployment.

## What is implemented

| Area | Capabilities |
|---|---|
| Catalogue | Search tracks, albums, artists, playlists and videos; inspect an item; browse allowlisted related music; open safe TIDAL links. |
| User account | Read the linked profile, owned playlists, and five saved-collection types. |
| Changes | Preview, confirm and apply playlist creation, metadata updates, deletion, item additions/removals/reordering, and collection saves/removals. |
| Protocol | Official SDK stdio and stateless Streamable HTTP; 12 tools; structured JSON plus text fallback; optional MCP Apps resource. |
| Authorization | Separate MCP and TIDAL OAuth boundaries; authorization code + S256 PKCE; resource/client binding; rotating MCP refresh tokens; encrypted TIDAL tokens. |
| UI | Search and filters, inspect dialogs, saved music, owned playlists, selection, exact-payload previews, confirmations, inline/fullscreen modes, mobile layout. |
| Design | 155 resolved variables from the supplied design archive; original tokens retained; no font binaries or framework-specific UI dependency. |

The API adapter has **43 explicitly selected method/path bindings**, not the entire TIDAL API. Available-but-unexposed and restricted families are explained in [API_ANALYSIS.md](docs/API_ANALYSIS.md). No audio download, DRM handling, lyrics, device-code login or remote-player control is implemented. Opening a TIDAL link is not a claim that playback started.

## Try the demo without npm dependencies or credentials

Requires Node.js 22.16 or later:

```sh
node scripts/demo.mjs
```

Open `http://127.0.0.1:3010`. The banner explicitly identifies the fictional music and in-memory account. Preview and confirm changes safely: they affect only the synthetic service and disappear on restart. The production entry point never falls back to this demo. `DEMO_PORT` selects another port.

Run the dependency-free checks:

```sh
node scripts/check.mjs
node --test tests/core/*.test.mjs
```

## Install for real TIDAL access

Obtain a TIDAL developer application, the required approved scopes, and the exact redirect URI registrations. Access still depends on your application's tier, account permissions, territory and TIDAL approval. `SG` is a configurable default market, not an assertion of catalogue or service availability there.

```sh
cp .env.example .env
node scripts/keygen.mjs
# Edit .env. Keep the generated encryption key private.
npm install
npm run build
npm test
npm run test:mcp
```

Set `TIDAL_CLIENT_ID`, optional confidential `TIDAL_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY`. A client secret enables application-token catalogue reads. Linked-account operations use user authorization. Never put the TIDAL secret or tokens in an AI prompt, MCP arguments or browser JavaScript.

### Local Codex / another stdio client

Set `DATA_DIR` to an **absolute private path** in `.env`, since the agent may launch the server from a different working directory. Register `http://127.0.0.1:8765/callback` with TIDAL for the local login flow, when your developer app permits loopback redirects. If a loopback redirect is not accepted, use the authenticated HTTPS deployment rather than weakening TIDAL's redirect policy.

Stop any server using this state directory, then:

```sh
npm run login
```

Open the printed URL in your browser, complete TIDAL consent, then configure the client using [CLIENTS.md](docs/CLIENTS.md). The production process is `node --env-file=/absolute/path/.env /absolute/path/src/main.mjs --stdio`; do not use `npm run stdio` as an agent command because npm can print non-protocol text to stdout.

One state directory has one writer. For several simultaneous agents, run one HTTP server and connect each agent to it; do not launch several stdio processes against the same directory.

### Remote ChatGPT / Codex / other MCP clients

Set `PUBLIC_ORIGIN=https://music.example.com`, configure `OAUTH_REDIRECT_ALLOWLIST` with the **exact agent callback URI**, register `https://music.example.com/tidal/callback` in TIDAL, and start `npm start` behind HTTPS. The MCP endpoint is `https://music.example.com/mcp`.

The TIDAL callback and the agent callback are different URLs with different owners. Follow [AUTH.md](docs/AUTH.md), [CLIENTS.md](docs/CLIENTS.md), and [DEPLOYMENT.md](docs/DEPLOYMENT.md). This package advertises DCR/public-client PKCE, not CIMD or client-secret authentication for agents.

### Enable writes deliberately

Leave `ENABLE_WRITES=false` for initial validation. To enable changes, set it to `true`, restart, and reauthorize with MCP `tidal:write` plus the required TIDAL write scopes. The host must still obtain explicit approval of the exact preview. A `confirm: true` argument alone is not cryptographic evidence of a human click.

## Repository map

`src/core/` contains authentication, storage, policy, JSON:API handling and business operations. `src/adapters/` integrates the TIDAL SDK. `src/mcp/` registers the official MCP tools and UI resource. `web/` contains the component and semantic CSS. `tests/core/`, `tests/mcp/` and `tests/browser/` separate evidence by layer. `scripts/` supplies build, demo, login, documentation, schema inventory and audit verification. `docs/` provides operating and contract documentation. `audit/` preserves executed results, screenshots, findings and integrity hashes.

Start with [ARCHITECTURE.md](docs/ARCHITECTURE.md), [TOOL_REFERENCE.md](docs/TOOL_REFERENCE.md), [TESTING.md](docs/TESTING.md), and [SECURITY.md](docs/SECURITY.md). [SOURCES.md](docs/SOURCES.md) records the official references.

The code is supplied under MIT; third-party SDKs, TIDAL content/branding and your supplied design material retain their own rights. This is an independent integration, not an official TIDAL product.
