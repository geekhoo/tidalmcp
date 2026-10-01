# MCP feature walkthrough and hosted UI proposal

Reviewed 1 October 2026 (Asia/Singapore). This is a fresh native-tool walkthrough of the configured `tidal` server at `https://tidalmcp.netlify.app/mcp`, separate from the earlier deployment acceptance report. No configuration change, deployment, live mutation or disconnect was performed for this walkthrough.

## Available tools and current access

Auth reports connected OAuth, MCP scope `tidal:read`, upstream scopes `search.read`, `user.read`, `playlists.read` and `collection.read`, with `writesEnabled:false`. Capabilities advertises 12 tools, five entity kinds and ten supported relationships. Registration does not mean every operation is authorized.

| Tool | Use | This walkthrough |
|---|---|---|
| `tidal_auth_status` | Connection, scopes, write setting | Passed |
| `tidal_capabilities` | Tool and limitation inventory | Passed |
| `tidal_search` | Tracks, albums, artists, playlists, videos; market and explicit-content policy | All five kinds passed; INCLUDE/EXCLUDE tested; track/artist next pages passed |
| `tidal_get` | Inspect a returned resource ID | All five kinds and an owned playlist passed |
| `tidal_related` | Supported catalogue/playlist relationships | All ten combinations passed; artist tracks and owned playlist items next pages passed |
| `tidal_get_me` | Read linked profile | Passed; personal fields omitted from the summary |
| `tidal_list_playlists` | Owned playlists | Passed; one owned playlist, reused for get/items |
| `tidal_list_collection` | Saved tracks, albums, artists, playlists, videos | All five passed; album/artist next pages passed |
| `tidal_prepare_change` | Exact change preview; no TIDAL mutation by itself | Implemented, gated by disabled writes and absent write scopes; not called |
| `tidal_commit_change` | Apply a specifically approved preview | Disabled; not called |
| `tidal_cancel_change` | Cancel an actual pending preview | No preview exists from this walkthrough; not called |
| `tidal_disconnect` | Remove stored connection tokens and revoke MCP access | Requires a specific disconnect request; not called |

Implemented change actions are playlist create/update/delete; item add/remove/move; collection save/remove. They were inventoried from current schemas, not executed. Even preparing a preview requires write authorization in this server. `confirm:true` is not human approval.

All **38 native MCP calls passed**, with **zero failures and zero pagination warnings**. IDs and cursors were reused from responses. Examples: search returned track `1550546` (One More Time), album `20115556` (Random Access Memories), artist `8847` (Daft Punk), and video `44187439` (Around the World), which were then inspected. Search result counts refer to the first page, not the entire catalogue.

Saved collection results: tracks 6; albums 20 first page + 17 second page; artists 20 first page + 20 second page with more available; playlists 7; videos 0 (successful empty collection). Safe result summaries and request IDs are retained in `C:/Users/kcgee/.codex/visualizations/2026/09/30/01a0f37f-f919-7f72-96f6-ff1c1ca5e2f7/tidal-feature-walkthrough.json`.

## Reusable skill

Created the discoverable user skill `tidal-mcp` at `C:/Users/kcgee/.codex/skills/tidal-mcp/SKILL.md`, with MCP dependency metadata in `agents/openai.yaml`. It describes read-tool routing, scope checks, ID/cursor reuse, error envelopes, exact-preview approval, duplicate occurrence IDs, uncertain-write handling and the optional host UI boundary. The bundled skill validator passed using Python UTF-8 mode. An independent gpt-6-luna/max review passed five behavioral scenarios: read-only walkthrough, changed-market cursor, duplicate occurrence removal, uncertain commit and absent host UI. The skill contains no credentials or fixed user-specific resource IDs.

Example invocation: `$tidal-mcp Find my saved albums and show the next page.` Discovery depends on the client loading installed skills; this existing conversation's original skill catalog is not rewritten by creating the folder.

## What the hosted UI actually implements

The production build is an MCP Apps component, using the official `App` bridge in `web/embedded.mjs`. The host loads the resource and brokers tool calls. This matches the [official MCP Apps host model](https://apps.extensions.modelcontextprotocol.io/api/documents/overview.html) and [OpenAI UI guidance](https://developers.openai.com/plugins/build/chatgpt-ui), which documents ChatGPT rendering and preserves tool-only operation in other clients. These sources do not establish compatibility with this specific Codex host.

Source in `web/ui.mjs` implements:

- Inline result display (up to six items), item inspection, metadata/document details and safe Open-in-TIDAL links.
- Host-controlled expansion into a fuller workspace with Discover, Saved music and My playlists views.
- Five catalogue kinds, market input, search and next-page navigation.
- Album and playlist item browsing. Other tool-supported relationships are not exposed as dedicated UI controls.
- Selection for tracks/videos; save selected, add to playlist and occurrence-aware removal from a playlist.
- Playlist create/edit/delete, exact-payload preview, explicit confirm/apply and preview cancellation.
- Connection status and a separate confirmed disconnect action.

These are code capabilities. With production writes disabled, mutation controls cannot complete changes. The UI does not yet consistently hide/disable change controls based on connection capabilities. Collection tools support all five kinds, but UI selection currently limits saving to tracks/videos. Item reordering and removing items from saved collections are tool capabilities without dedicated UI flows. The add-to-playlist chooser explicitly displays only the first page of owned playlists.

There is no audio player, remote playback control, lyrics or download implementation. Opening TIDAL does not establish that music played. The fictional standalone demo uses its own in-memory adapter and is not a connected production account UI.

## Browser evidence and present usability

Fresh real-browser inspection of `https://tidalmcp.netlify.app/widget.html` displayed `This UI needs an MCP Apps-compatible host. The same tools remain available without UI.` Clicking Expand displayed `This host did not allow expansion. Use the same tools through the conversation.` Screenshot: `C:/Users/kcgee/.codex/visualizations/2026/09/30/01a0f37f-f919-7f72-96f6-ff1c1ca5e2f7/tidal-hosted-ui-expand.png`.

After native UI-enabled tool calls, the browser backend listed no expanded MCP App tabs. It cannot inspect inline-only apps. Therefore this Codex host's interactive rendering remains unverified. The earlier Chromium official `AppBridge` test rendered results and serviced `tidal_get` against a synthetic read-only host; it is not live Codex-host proof.

Today, the dependable route in this conversation is native MCP tools and structured/text results. In a compatible MCP Apps host, the existing component is designed to provide the richer workspace. Loading `/widget.html` directly supplies neither the bridge nor a logged-in browser session.

## Same-day Codex host verification follow-up

The user supplied a real Codex screenshot after fresh native `tidal_search` and `tidal_get` calls. It shows the inline TIDAL music workspace rendering the live **One More Time** result, with artwork, Daft Punk attribution and duration. Search request `YjEuzy980DmHe5yc` returned 20 tracks; get request `UE9QBnphqrU2EG5G` returned the selected track. **Inline rendering in this Codex host is now confirmed.** This supersedes the earlier rendering uncertainty above.

The initial empty `mcpapps` inventory reflected an inline card, outside that backend's documented side-panel scope. After the user opened the card using the header's diagonal-arrow control, the backend exposed app tab `1`. **Real Codex-host interaction is now verified**, not just inline rendering or a synthetic bridge test.

Using browser automation on that actual app, the following read interactions passed:

- Search for Daft Punk in SG rendered 20 tracks.
- Switching to Albums rendered 20 album results.
- Clicking Random Access Memories fetched and opened its details, showing returned ID `20115556` and duration 74:39.
- Next page returned different album results, beginning with Get Lucky (feat. Pharrell Williams & Nile Rodgers).
- Saved music displayed 20 saved albums.
- My playlists displayed the owned Pride Parties 2026 playlist.

One attempt to click One More Time timed out because the observed app state had changed to Saved videos; it was not an upstream/tool error. A fresh snapshot was taken and the subsequent album inspection passed. No editing or disconnect controls were exercised, and native auth still reported writes disabled.

Preserved evidence directory: `C:/Users/kcgee/.codex/visualizations/2026/09/30/01a0f37f-f919-7f72-96f6-ff1c1ca5e2f7/`. Files: `tidal-codex-inline-confirmed.png` (user-supplied inline screenshot), `tidal-codex-live-inspect.png` (browser-captured live inspection), `tidal-codex-live-playlists.png` (browser-captured owned playlists), and `tidal-codex-host-verification.json`. The direct `/widget.html` host requirement remains valid; the working UI is hosted by Codex's MCP Apps bridge.

## Proposed implementation order

These are proposals, not additional changes made in this walkthrough.

1. **Verify the intended real host first.** Connect the existing authenticated MCP in a host that supports MCP Apps, trigger a UI-enabled search, expand if allowed, inspect a result and fetch its next page. Pass criteria: real account data, successful host-brokered read calls, observable UI and zero mutations. The official [testing guide](https://apps.extensions.modelcontextprotocol.io/api/documents/testing-mcp-apps.html) provides a reference `basic-host` for development, but remote OAuth compatibility must be verified rather than assumed from its local example.
2. **Make the current workspace reflect actual access.** Read auth/capabilities on startup, show read-only/connected state, disable gated mutation controls, and separate host-unavailable from auth-expired errors. Preserve useful read results when expansion is declined. Pass criteria: writes-disabled users see working read navigation without futile edit actions; read tools stay usable without UI.
3. **Expose the existing read capabilities.** Add artist albums/tracks, track artists/albums/similar/radio navigation, explicit-content filter, and clear page/history handling. Show exact error codes/request IDs and pagination warnings. No new upstream routes are needed. Pass criteria: each UI route calls the existing tool with the selected returned ID and preserves paging arguments.
4. **Finish the editing surface only as a separate authorized phase.** Add five-kind collection selection/removal, an owned-playlist chooser with pagination, and occurrence-aware item reordering. Preserve exact previews, visibility language and uncertain-outcome handling. Writes remain off until separately authorized and the required scopes are granted; synthetic tests can validate the flows first.
5. **If a direct website is the goal, build a host shell or browser application.** Keep the current widget as the MCP App and add a separate page that owns the bridge and an official MCP client, or use a same-origin backend session/API adapter for the shared service. Both need a real browser OAuth/session design; CLI OAuth credentials are not a browser session. Keep TIDAL tokens server-side, use narrowly approved origins and read-only tool exposure, and never put developer secrets in the widget. Pass criteria: a normal browser can sign in and search/inspect without an AI host, with no credentials in page source/output or OAuth query logs.
6. **Optional future playback feasibility study.** TIDAL publishes an official [Web Player module](https://tidal-music.github.io/tidal-sdk-web/modules/_tidal-music_player.html) with load/play/pause/seek APIs. That establishes a supported integration surface, not that this application is entitled to full-track playback. A separately scoped study would check application eligibility, SDK credential flow, host media/network permissions and real browser playback events. It would require revising the current no-playback product contract; downloads, DRM bypass and lyrics remain excluded. No player package was added or playback attempted here.

Step 1 is now verified for this Codex desktop host. My recommendation is steps 2–3 next: make the existing workspace accurately reflect read-only access, then expose reads already proven by the MCP. A standalone website is a separate product decision and a larger authentication/hosting task.
