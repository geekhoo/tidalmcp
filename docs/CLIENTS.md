# Client setup and portability

## Compatibility contract

The active hosted endpoint is **`https://tidal.pippinpuffin.com/mcp`**. `https://tidalmcp.netlify.app/mcp` is deprecated; use the migration steps below for an existing connection. Hosted clients need no repository clone, Node/npm install, server `.env`, or TIDAL developer credentials.

The server targets MCP clients that support stdio or Streamable HTTP. Remote clients must support resource-bound authorization-code OAuth with S256 PKCE and public-client DCR. UI rendering additionally requires MCP Apps support; it is not promised for every Codex surface or every agent. Tools remain text/JSON-usable without UI. Codex live reads and host-bridge interaction were recorded in [SELF_HOST_VALIDATION.md](SELF_HOST_VALIDATION.md); that does not establish ChatGPT/public app approval or compatibility with every host.

## Codex local stdio

Install/build, set an absolute `DATA_DIR` in the private `.env`, then run `npm run login` with the server stopped. Use absolute paths in `~/.codex/config.toml`:

```toml
[mcp_servers.tidal]
command = "node"
args = ["--env-file=/absolute/path/tidal-mcp-app/.env", "/absolute/path/tidal-mcp-app/src/main.mjs", "--stdio"]
startup_timeout_sec = 30
tool_timeout_sec = 120
```

On Windows, forward-slash absolute paths such as `C:/apps/tidal-mcp-app/.env` avoid TOML escaping issues. Do not copy a secret into the config. The command uses Node directly because stdout is reserved for MCP framing. A single local state directory cannot be opened by two server processes at once. Give separate local installations separate directories/keys, or prefer one HTTP service for simultaneous agents.

## Codex remote HTTP

```sh
codex mcp add tidal --url https://tidal.pippinpuffin.com/mcp --oauth-client-registration dcr
codex mcp login tidal --scopes tidal:read,tidal:write --oauth-client-registration dcr
codex mcp get tidal --json
codex mcp list --json
```

Alternatively set:

```toml
[mcp_servers.tidal]
url = "https://tidal.pippinpuffin.com/mcp"
tool_timeout_sec = 120
```

The add command may start login. The explicit login command requests `tidal:read,tidal:write` by default; complete consent in your own browser. Verify the URL with `get` and an enabled server with `auth_status: o_auth` in `list`. Restart/reopen Codex after adding or changing a connection, then call `tidal_auth_status({})` and `tidal_capabilities({})` in the chat. CLI authentication is distinct from callable tools in an already-open chat.

Before authentication succeeds, the operator must approve the **actual complete redirect URI emitted by that client version** in `OAUTH_REDIRECT_ALLOWLIST`. Callback paths and ports can vary by client version/configuration; do not assume the example `8766/callback` matches your Codex installation. Use the current official client configuration reference and its emitted authorization request to determine the URI. Do not paste code-bearing callback URLs or token logs into a conversation. The exact redirect is benign configuration; authorization codes, states and verifiers are not.

The active hosted service defaults to write-enabled access. A read-only connection remains available by requesting `--scopes tidal:read` instead. An existing read-only token must be reauthorized with both scopes; refresh cannot broaden it. A successful write-scoped login grants permission to use previews/commits, not approval for any particular library change.

### Migrate an existing Netlify connection

Inspect `codex mcp get tidal --json`, then update only the existing `[mcp_servers.tidal]` URL in `~/.codex/config.toml` to `https://tidal.pippinpuffin.com/mcp`, preserving unrelated settings. Alternatively use the `codex mcp add tidal --url ... --oauth-client-registration dcr` command above to register the active endpoint. Run the login command above if the new endpoint needs authorization; do not assume an old token applies to a different protected resource. Check URL/auth status, restart/reopen Codex, and verify the actual tools. In other clients, edit the existing connection URL and complete OAuth as needed. Do not keep Netlify as an automatic fallback or call `tidal_disconnect` to migrate; disconnect revokes account access rather than merely changing a client URL.

## ChatGPT remote connection

In the custom MCP connection UI available to your account/workspace, add `https://tidal.pippinpuffin.com/mcp` as a Streamable HTTP service. Choose public-client DCR OAuth; CIMD is not advertised or implemented. Record the callback URL shown in app management and have the service operator add that exact URL to `OAUTH_REDIRECT_ALLOWLIST` and restart the server before connecting. A hosted client does not need to deploy its own server.

The current official authentication guide identifies the modern callback shape as `https://chatgpt.com/connector/oauth/{callback_id}`; copy the real value from management instead of using the literal placeholder. Legacy published apps may have an older callback. Register the server's `/tidal/callback` separately with TIDAL. Workspace policies and account availability can affect whether custom connections are offered.

Test a read-only prompt first: “Search TIDAL for an artist I name, show the matching tracks, and don't modify anything.” Inspect the optional music UI when supported. Test approval-gated actions only with a disposable, explicitly named canary playlist and the release procedure in TESTING.md. The hosted endpoint is available for compatible clients; this source package does not submit an app for public distribution.

## Other MCP agents

A common stdio configuration shape is:

```json
{
  "mcpServers": {
    "tidal": {
      "command": "node",
      "args": ["--env-file=/absolute/path/tidal-mcp-app/.env", "/absolute/path/tidal-mcp-app/src/main.mjs", "--stdio"]
    }
  }
}
```

Use the client's documented configuration location/shape; this JSON convention is not mandated by the MCP wire protocol. For hosted access, configure `https://tidal.pippinpuffin.com/mcp` using the client's Streamable HTTP configuration and run public-client DCR/PKCE OAuth discovery. Clients without MCP need an MCP adapter; this package does not magically add MCP support to arbitrary models or non-MCP APIs.

## Read workflows and optional skill

Check `tidal_auth_status` and `tidal_capabilities`, then use `tidal_search` for discovery, `tidal_get` to inspect a returned ID, and `tidal_related` for allowlisted relationships. Use `tidal_list_playlists` for owned playlists and `tidal_list_collection` for saved music. Pass any returned `nextCursor` unchanged with the original arguments. Examples:

- “Find Daft Punk tracks in SG, inspect one result, and show related albums.”
- “Show my saved albums and the next page.”
- “List my owned playlists, then inspect the items in one I select.”
- “Prepare an unlisted playlist with these tracks; show me the exact preview and wait for approval before creating it.”

The installed Codex `tidal-mcp` skill (`~/.codex/skills/tidal-mcp/SKILL.md`) supports setup and these workflows; invoke `$tidal-mcp` when available. A skill is guidance, not an MCP installation or OAuth grant. `/widget.html` is a component preview; interactive use needs an MCP Apps host bridge. Use text/JSON results in clients without UI support. Opening a TIDAL link does not start playback through this server.

## Approval policy for every host

Never autoapprove `tidal_commit_change` or `tidal_disconnect`. Read the target, action, visibility, item count and exact payload before approval. A model should use `tidal_prepare_change`, explain the preview, obtain explicit user consent, then reuse that plan ID/digest. A cancellation only closes a preview; it is not an undo command. On uncertain outcomes, preserve the existing plan and inspect state. Do not “try again” by preparing a fresh duplicate mutation.

Official OpenAI and MCP references are recorded in SOURCES.md. Configuration examples are supplied, not evidence that a specific client version has been tested here.
