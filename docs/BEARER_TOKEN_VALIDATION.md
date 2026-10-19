# Bearer-token validation — 19 October 2026

The Fedora service at `https://tidal.pippinpuffin.com/mcp` was updated with per-agent bearer-token support. The deployment remains one Compose service in `/home/geek/tidal-mcp-app`, with its existing state volume and encryption key preserved. OAuth remains configured alongside agent tokens. This report records bounded implementation and authentication checks, not independent security certification.

## Executed checks

- Local syntax/CSS checks and production build passed.
- Local core tests: 97 passed; official MCP/TIDAL SDK tests: 10 passed; Chromium browser tests: 3 passed.
- The Fedora production image passed all 107 core/SDK tests without external networking. Its build and prune steps reported zero dependency vulnerabilities; the local production dependency audit also reported zero.
- MCP client/core/server packages are pinned to 2.3.1 and the compatible Node transport to 2.1.1. This resolves the client advisory found during the initial audit; MCP Apps and TIDAL SDK pins are unchanged.
- A 30-day, individually revocable Dot token was issued for the already-linked account with `tidal:read` and `tidal:write`. The secret was delivered to a private Windows file whose ACL allows only its owner and SYSTEM. The secret was never printed or included in repository files.
- An official SDK client using that bearer token listed all 12 tools, called auth/capabilities successfully, and completed a live SG track search returning 20 items. The account reported connected and writes enabled with the expected MCP and upstream scopes.
- A separately issued read-only probe token authenticated successfully. Its own revocation succeeded, its next request received HTTP 401, and Dot's token continued to authenticate.
- A second official SDK client on Windows independently authenticated with the privately delivered Dot credential.

Initial browser execution was blocked by the missing Playwright browser; installing Chromium resolved it. A first container CLI test inherited the image's public bind address despite using a synthetic loopback origin; the test environment was isolated and the image suite rerun successfully. The initial dependency advisory was fixed before activation. No failed check is represented here as a pass without its corrective rerun.

## Safe request index

| Check | Request ID |
|---|---|
| Bearer auth status | `WUWyk06RVaD18BQi` |
| Capabilities | `uXrO6EcaYCw-a-cW` |
| Live search | `wgBS9KtnlqJ03wpx` |
| Windows private-file authentication | `bt69Qu6VvtshdvIX` |

The safe local summary is `test-results/bearer-validation-20261019.json` (gitignored). The Dot credential expires on 18 November 2026 at 21:54 Singapore time. Other agents need their own separately issued credentials. No playlist/collection mutation or real-account disconnect was performed; write execution was not live-tested in this change.

## Recovery

The previous source files and image reference were retained under `/home/geek/tidal-agent-token-backup-20261019`; the old image is tagged `tidal-mcp-agent-token-rollback:20261019`. A private encrypted-state/audit snapshot was retained in the existing volume under `backup-agent-tokens-20261019`, taken while the owning server was stopped. Preserve the encryption key separately.

To disable this feature on the updated server, set `ENABLE_AGENT_TOKENS: "false"` in Compose and recreate the service. Before downgrading to the previous code, revoke agent-token families using the updated CLI: the older verifier understands the reused access/family records but does not implement the new feature kill switch. Keep current state unless an actual state restore is necessary; a stale snapshot can discard later account and mutation state. Never use `docker compose down -v` for rollback.

At validation time, the implementation was deployed as a verified working-tree overlay on repository commit `8e97dd2`, before publication of the implementation commit. The generated UI is bundled in the production image. See [BEARER_TOKENS.md](BEARER_TOKENS.md) for the design, official references and operator/client instructions.
