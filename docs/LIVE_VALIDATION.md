# Live read validation — 1 October 2026

This follow-up is separate from the historical `audit/REPORT.md`. Historical failures and manifests were not rewritten. The existing OAuth connection was reused; no live mutation or disconnect tool was called. Production auth reported `writesEnabled: false` throughout.

Production endpoint: **https://tidalmcp.netlify.app/mcp**. Final deployment **`6abdacba4f5e0fa402b9b4be`**, confirmed `ready`, production, published **2026-10-01T00:43:46.692Z**. All final live replays below ran after publication. The preceding deployment `6abda80cae47b573aacf29c7` is the rollback reference; no rollback was performed.

## Remediation and exact observed failures

| Observation | Remedy | Evidence |
|---|---|---|
| MCP initialization returned JSON-RPC `-32700`: `Parse error("TypeError: Cannot read properties of undefined (reading 'length')")`, wrapped by the client as `-32603`. | The partial Node request shim did not provide the SDK's expected `rawHeaders`. Netlify now uses the official `WebStandardStreamableHTTPServerTransport` with the original web Request, shared authorization checks and parsed body. The response is consumed before closing its per-request server. | Official SDK client regression plus deployed authenticated tools. |
| Search returned HTTP 400, `TIDAL_BAD_REQUEST`, upstream `INVALID_RESOURCE_ID`. | Call the official `/searchResults` entrypoint with `filter[query]`; validate its single-resource array and reuse `data[0].id` in the relationship path. Search cursors carry that ID and are bound to the original effective search arguments. | Five live catalogue types and search second pages. |
| Search and collection first pages silently lost pagination, with `The upstream next link was not safe for this exact route; it was not followed.` | Resolve TIDAL's API-relative links beneath `/v2`, retaining exact origin/route checks and rejecting path aliases. Extract only the opaque cursor and rebuild requests from validated arguments. | Live search tracks/artists and saved albums/artists second pages contain different IDs, without warnings. |
| Native artist-track read returned HTTP 400, `TIDAL_BAD_REQUEST`, upstream `MISSING_REQUIRED_PARAMETER`, request ID `hC4LyHW7plzT2gBx`. | Supply API-required `collapseBy=NONE` only for `artists/tracks`. `NONE` is an application choice from the SDK enum, not a documented upstream default. | Core route-isolation regression, official SDK serialization, and live replay using returned artist ID `30528`. |
| Netlify CLI 27.10.2 rejected the preparation command: `Error: --context flag is only available when using the --build flag`. | After a verified build, deploy with `--prod --no-build`, omitting `--context`. | Successful production deploy; documented in `DEPLOYMENT.md`. |

The prior CSP form-redirect and Blobs strong-read/state-refresh fixes were preserved. No dependency upgrade or wholesale API-schema refresh was needed. The allowlist now contains 44 bindings because the documented search entrypoint was added.

## Evidence classes

- `npm run verify`: syntax/CSS check, production build, **87/87 core tests**, **8/8 MCP/official SDK tests**. Core tests use synthetic upstreams. SDK tests use real official libraries with controlled network responses; they do not independently establish live compatibility.
- `npm run test:browser`: **3/3 Chromium tests**. Includes the built widget, official `AppBridge`/`PostMessageTransport`, receiving a search result and making one read-tool call; synthetic host writes disabled and zero mutations.
- Live tests use the actual configured `tidal` server through Codex's MCP tool API, including native calls in this conversation. Resource IDs and pagination cursors come from preceding responses. The matrix covers auth, capabilities, five search/get types, allowlisted relationships, profile, owned playlists and all five saved collections.

The tracked lockfile has version 3; direct pins match `package.json`, and its resolved package URLs use `registry.npmjs.org`. This is a dependency-source review, not a vulnerability advisory scan.

## Final live results

| Read coverage | Result |
|---|---|
| Auth and capabilities | Connected through OAuth; 12 tools; MCP `tidal:read`; upstream `search.read`, `user.read`, `playlists.read`, `collection.read`; writes disabled. |
| Search and get | Tracks, albums, artists, playlists and videos pass. Every get uses a search-returned ID. Track search second page passes. |
| Related music | All ten supported kind/relation combinations pass: album items/artists; artist albums/tracks; track albums/artists/radio/similarTracks; playlist items/coverArt. Second pages pass for artist tracks, similar tracks and owned playlist items. |
| My profile and playlists | Profile, owned-playlist list, get and items pass. One owned playlist returned; its ID is reused. |
| Saved collections | Tracks 6, albums 20 on first page, artists 20 on first page, playlists 7, videos 0. Empty videos is a successful empty collection. Album second page returns 17; artist second page returns 20. |

The final broad matrix passed **34/34 calls**, and the focused pagination replay passed **10/10 calls**, with **zero errors and zero pagination warnings**. Native tools in this conversation separately passed the previously failing artist `30528` tracks read, its second page and auth status (**3/3 final native replays**). Earlier native calls covered every requested tool family; the original artist-track failure remains recorded separately.

Sanitized evidence directory: `C:/Users/kcgee/.codex/visualizations/2026/09/30/01a0f37f-f919-7f72-96f6-ff1c1ca5e2f7/`. Files include `tidal-final-deploy-results.json`, `tidal-final-pagination-results.json`, `tidal-native-final-replay.json`, `tidal-final-deploy.json`, `tidal-final-published.json`, `tidal-final-deploy-metadata.json`, and `tidal-final-standalone.png`. Each live result retains tool arguments, request IDs and result/error summaries, without credentials or OAuth callback queries. `tidal-native-before-artist-fix.json` preserves the original failed call.

## MCP Apps UI boundary

The deployed UI resource is readable as `text/html;profile=mcp-app`; its SHA-256 matches the locally built resource: `ccfe0aa0e9e7fdd6e8644874d20efd8da529df72de72ab541eb78c2860262c8e` (476184 bytes).

Real browser inspection of deployed `/widget.html` shows: `This UI needs an MCP Apps-compatible host. The same tools remain available without UI.` This is the expected standalone behavior. The official bridge Chromium test renders the UI and services a read action; screenshot: `../test-results/host-bridge.png`.

Native UI-enabled TIDAL calls succeeded, but browser inventory exposed no expanded MCP App tab. That inventory cannot observe apps displayed only inline. Interactive rendering in this Codex host is therefore **unverified**, not a server resource-delivery failure or proof that the host is unsupported. A visible expanded app is needed to inspect it and exercise a read action with the real host bridge.

## Primary references

Same-day follow-up: a user-supplied real Codex screenshot confirmed inline MCP App rendering after native search/get calls (`YjEuzy980DmHe5yc`, `UE9QBnphqrU2EG5G`). After the user opened the side panel, browser automation exposed the actual app and verified live search, album filtering, album inspection, next-page navigation, saved albums and owned playlists. **Rendering and read interactions in this Codex desktop host are now confirmed**, superseding the earlier uncertainty. Screenshots and details are recorded in `MCP_USAGE_AND_UI.md`; the historical release checks above are unchanged. No live mutation or disconnect was performed.

- [Official MCP SDK v2 migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2): web-standard transport boundary.
- [Netlify MCP deployment guidance](https://www.netlify.com/knowledge-base/how-to-build-and-deploy-an-mcp-server-on-netlify/): serverless MCP hosting.
- [Official MCP Apps overview](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html): host bridge and UI-resource roles.
- [Official TIDAL SDK](https://github.com/tidal-music/tidal-sdk-web) and [current official OAS](https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json): corroborate the search entrypoint and required artist-track parameter. Implementation was checked against the installed pinned SDK's generated declarations; the current OAS has version 1.10.145.

No commit or push was performed. Unrelated pre-existing working-tree changes were preserved. Broader territory/account coverage, live writes, vulnerability advisories and interactive rendering in this Codex host are not certified by these checks.
