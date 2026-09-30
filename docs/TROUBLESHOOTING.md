# Troubleshooting

| Symptom | Check / action |
|---|---|
| `ERR_MODULE_NOT_FOUND` or esbuild missing | Run a successful online `npm install`, retain the lock, then build. The dependency-free demo is not a production fallback. |
| Invalid configuration at startup | Use an exact HTTPS origin (or loopback for local development), a canonical 32-byte base64 key, valid port and private data directory. |
| `STORE_LOCKED` | Stop the process owning the directory. Inspect PID/lock after crashes; never remove a live lock. Use one HTTP process for many agents. |
| `STORE_DECRYPTION_FAILED` | Restore the correct key/state pair. Do not bypass authenticated decryption. |
| Local agent sees no connected account | Use the same absolute DATA_DIR/key/profile for login and stdio. Different working directories otherwise create different state. |
| OAuth `invalid_redirect_uri` | Copy the client's actual complete callback into the operator allowlist. Register the separate server `/tidal/callback` in TIDAL. No wildcards. |
| OAuth `invalid_client` | Retain registered client/state; select DCR with public-client `none`. CIMD, Basic agent client auth and private-key JWT are not implemented. |
| Consent rejected | Submit from the same browser/origin before expiry. Do not copy state/callback into another browser or agent. Start a fresh flow after denial/expiry. |
| `/mcp` 401 | The bearer must be a valid locally issued MCP token, not a TIDAL token. Follow discovery/reauthorization. |
| `/mcp` 421 / Origin rejected | Preserve the configured Host through the proxy and use exact allowed Origins. Do not trust arbitrary forwarded headers or disable the checks. |
| TIDAL 403 | Check approved scopes, access tier, account/resource permission and market. Repeated token refresh is not an entitlement fix. |
| `WRITES_DISABLED` | Explicitly enable writes, restart, reconnect and approve the exact preview. Do not change it merely to make a read succeed. |
| `STALE_PLAN` / `PLAN_EXPIRED` | Read current state and prepare a fresh preview, except when a previous write has an uncertain outcome. |
| `WRITE_OUTCOME_UNKNOWN` | Preserve the same plan. Retry only within its window, with the same digest/key; otherwise inspect actual TIDAL state before any replacement operation. |
| UI does not appear | Confirm host MCP Apps support, successful production build, resource metadata and connection refresh. Tools remain usable as text/JSON. |
| Fullscreen denied | Keep the inline view or use conversation tools. The component must not force a host display mode. |
| Demo “Open” does not launch a song | Intentional: the item is fictional. Production returns only allowlisted TIDAL links. |
| UI remains light in a dark host | The supplied dark token draft is incomplete and intentionally not activated. |

For failures, retain the safe request ID and relevant tool/action. Do not paste `.env`, token responses, code-bearing callback URLs or encryption keys into tickets or AI conversations.
