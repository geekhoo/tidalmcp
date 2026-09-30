# Working on this repository

TIDAL catalogue/library MCP server with an optional MCP Apps UI. Plain Node.js ESM (`.mjs`, no framework, no compile step) targeting Node >= 22.16. Read `README.md`, `SPEC.md` (acceptance contract), `audit/REPORT.md` and relevant `docs/` before changing behavior. Tests with synthetic upstreams are core evidence, not proof of SDK or live-service compatibility.

## Commands

- CI gate: `npm run verify` = `check` → `build` → `test` → `test:mcp`, then `test:browser` (needs `npx playwright install chromium` first).
- `npm run check` is the only lint: `node --check` syntax over every `.mjs` plus CSS-variable resolution. There is no ESLint or `tsc`; it does not validate SDK imports or types (`types/contracts.d.ts` is hand-maintained, not compiled).
- Tests are separate evidence classes (see `docs/TESTING.md`): `npm test` (65 core tests, dependency-free, synthetic upstream), `npm run test:mcp` (real official MCP/TIDAL SDKs over stdio — missing packages fail the run, they never skip), `npm run test:browser`, `npm run test:coverage`, `python tests/browser/run.py` (alternate Python harness, own loopback on 3017; `CHROMIUM_EXECUTABLE` reuses an installed browser).
- Single test file: `node --test tests/core/<name>.test.mjs` (Node's built-in runner; no vitest/jest).
- Credential-free demo: `node scripts/demo.mjs` → http://127.0.0.1:3010 with fictional in-memory data. The production entry (`src/main.mjs`) never falls back to it.

## Generated files — do not hand-edit

- `web/tokens.css` + `audit/design-token-map.json`: regenerated from `design-source/` by `scripts/tokens.mjs`, which runs at the start of every `npm run build`.
- `docs/tools.json`, `docs/TOOL_REFERENCE.md`, `docs/endpoint-allowlist.json`: `npm run docs`.
- `dist/widget.html` + `dist/build-manifest.json`: build output (gitignored).
- `npm run schema:refresh` downloads the TIDAL OAS into `docs/upstream/` (network).
- Keep contracts, payload compiler/plan previews, scope checks, fixtures, negative tests and generated docs in sync when changing tools.

## Auth and state quirks

- Real use needs `.env`: `cp .env.example .env`, `node scripts/keygen.mjs` for `TOKEN_ENCRYPTION_KEY`. Never commit `.env`. Tokens and OAuth callback query strings must not appear in commits, prompts, screenshots or operational logs.
- `DATA_DIR` (default `./var`) is single-writer: one stdio process per state directory; several simultaneous agents must share one HTTP server instead.
- For an agent-launched stdio client use `node --env-file=/absolute/path/.env /absolute/path/src/main.mjs --stdio` — never `npm run stdio`, because npm writes non-protocol text to stdout. Set `DATA_DIR` to an absolute path in `.env`.
- `npm run login` / `npm run logout` manage the local stdio profile (loopback callback `http://127.0.0.1:8765/callback`).
- `ENABLE_WRITES=false` stays false unless a human explicitly approves a write test; `confirm: true` in a tool call is not human approval. Preserve duplicate occurrence IDs, exact preview digests and idempotency keys across uncertain writes; never create a replacement mutation to recover from an unknown outcome.

## Hard rules

- Use the official SDK boundaries (MCP SDK v2, MCP Apps, TIDAL API SDK); never replace them with handwritten MCP JSON-RPC.
- Do not add undocumented/internal TIDAL routes, arbitrary URL/header tools, audio download, DRM or lyrics features, or credentials in UI/tool output. The adapter is a curated allowlist (43 bindings in `docs/endpoint-allowlist.json`), not the full API.
- Never alter `audit/` results to imply a blocked check passed. Blocked commands are recorded honestly; delivery manifests are refreshed only as a new release artifact — do not rewrite historical evidence.
- `package-lock.json` was absent from the reviewed delivery; keep the one `npm install` generates and review it before release (CI falls back to `npm install` with a warning when it is missing).
- npm 11+ may warn that esbuild's postinstall script was blocked; the build still works (the platform binary ships via the `@esbuild/*` optional dependency).
