# Fedora self-host validation — 1 October 2026

The active MCP endpoint is `https://tidal.pippinpuffin.com/mcp`. One Docker Compose service runs from `/home/geek/tidal-mcp-app` on Fedora, with host-loopback `127.0.0.1:3005` mapped to container port `3000`. Caddy proxies that loopback port; the UI uses the same service and requires an MCP Apps host bridge.

## Evidence and results

- The Docker image built and Compose started successfully. The running container passed 95 core/official-SDK tests. Local browser tests passed separately; these test suites are distinct from live TIDAL compatibility.
- HTTPS health and OAuth discovery passed. Unauthenticated `/mcp` returned the expected HTTP 401. The protected endpoint is not a browser login page.
- A fresh authenticated Codex CLI exercised 43 live read calls: auth, capabilities, five search kinds, five gets, all ten supported related pairs, profile, owned playlists and items, all five saved collections, and twelve second pages. All passed, with no pagination warnings, repeated cursors or overlapping page IDs. Saved videos were successfully empty. See local `test-results/fedora-tool-showcase.json` for request IDs; profile fields are omitted there.
- After restarting Codex desktop, native `tidal_auth_status` request `r260nzKgmbLr9X-J` and `tidal_capabilities` request `eq7AuSbpOs9Q68wt` matched the Fedora audit log. The connection reported `connected=true`, `writesEnabled=true`, MCP `tidal:read`/`tidal:write`, and upstream `user.read`, `playlists.read`, `collection.read`, `collection.write`, `search.read`, `playlists.write`.
- Real browser automation opened the hosted Codex MCP App, clicked “One More Time”, and read the returned track dialog. Fedora recorded the UI's `tidal_get` request `xuxGh3V22QIPFUGC`. “My playlists” rendered the owned playlists and later the newly created playlist. This verifies rendering and live host-bridge interaction, beyond resource delivery or a synthetic host test.

The earlier desktop session retained its original read-only connection after the configuration changed. Restarting Codex replaced it with the self-hosted connection; another account login was not necessary.

## Approved write test

The human explicitly enabled writes and approved each exact preview before commit. The first creation preview expired without a write; a renewed preview received separate approval.

Created [Thursday Drift — 1 Oct 2026](https://listen.tidal.com/playlist/03612dc8-0979-478b-a4d0-31956ebba647), playlist ID `03612dc8-0979-478b-a4d0-31956ebba647`, with description “A short Daft Punk arc: dreamy beginnings, bright grooves, and an easy lift.” Visibility is `UNLISTED`, meaning accessible by link.

Fedora's audit records the initial creation commit `E9zYOY16k5V8n5cx` and addition commit `e9uC1fGJCQwRBFjK`, followed by completed-plan replays `0niduy2kDn8BT1XE` and `WHLW_O9-0Ihmp7Cg`. The returned creation result was HTTP 201; addition was HTTP 200, `partial=false`, with no skipped items. Both replay envelopes reported `replayed=true`, as expected from the completed-plan branch in `src/core/plans.mjs`. The audit alone does not establish which host interaction sent the initial requests. No replacement mutations were prepared. Readback request `hQAWqatMq15KR_yY` confirmed exactly five distinct occurrences, in this order, with no next page:

| Track | Returned ID |
|---|---|
| Something About Us | 1550554 |
| Digital Love | 1550548 |
| One More Time | 1550546 |
| Get Lucky | 20115564 |
| Lose Yourself to Dance | 20115562 |

Owned-playlist readback `8ZXRkQkBCJ38c0rA` reported duration `PT26M18S`. The live App also displayed the playlist with `26:18`. No existing playlist was edited and no account was disconnected.

Local evidence is retained in `test-results/fedora-native-validation.json`, `fedora-codex-app-inspect.png`, `fedora-codex-app-playlists.png`, and `fedora-codex-app-created-playlist.png`. These generated evidence files are gitignored; this report preserves the safe result and request-ID index.

No failures occurred in the completed live read or approved write tests. Other write actions, UI write-button submission, playback, and standalone authenticated website operation were not tested. Playback and a standalone host bridge are not implemented by this MCP.
