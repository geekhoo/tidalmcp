# Client setup and portability

## Compatibility contract

The server targets MCP clients that support stdio or Streamable HTTP. Remote clients must support resource-bound authorization-code OAuth with S256 PKCE and public-client DCR. UI rendering additionally requires MCP Apps support; it is not promised for every Codex surface or every agent. Tools remain text/JSON-usable without UI. The package has not been registered, installed or end-to-end exercised inside your ChatGPT or Codex account.

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
codex mcp add tidal --url https://music.example.com/mcp
codex mcp login tidal
codex mcp list
```

Alternatively set:

```toml
[mcp_servers.tidal]
url = "https://music.example.com/mcp"
tool_timeout_sec = 120
```

Before authentication succeeds, the operator must approve the **actual complete redirect URI emitted by that client version** in `OAUTH_REDIRECT_ALLOWLIST`. Callback paths and ports can vary by client version/configuration; do not assume the example `8766/callback` matches your Codex installation. Use the current official client configuration reference and its emitted authorization request to determine the URI. Do not paste code-bearing callback URLs or token logs into a conversation. The exact redirect is benign configuration; authorization codes, states and verifiers are not.

## ChatGPT remote connection

Deploy the HTTPS service first, then use ChatGPT's developer-mode/app/plugin connection UI available to your account/workspace to add the remote MCP endpoint. Choose the DCR OAuth path for this package; CIMD is not advertised or implemented. Record the callback URL shown in app management, add that exact URL to `OAUTH_REDIRECT_ALLOWLIST`, and restart the server before connecting.

The current official authentication guide identifies the modern callback shape as `https://chatgpt.com/connector/oauth/{callback_id}`; copy the real value from management instead of using the literal placeholder. Legacy published apps may have an older callback. Register the server's `/tidal/callback` separately with TIDAL. Workspace policies and account availability can affect whether custom connections are offered.

Test a read-only prompt first: “Search TIDAL for an artist I name, show the matching tracks, and don't modify anything.” Inspect the optional music UI when supported. Test approval-gated actions only with a disposable, explicitly named canary playlist and the release procedure in TESTING.md. This source package does not submit an app for public distribution or provide a public endpoint.

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

Use the client's documented configuration location/shape; this JSON convention is not mandated by the MCP wire protocol. HTTP clients configure the remote URL and run its OAuth discovery flow. Clients without MCP need an MCP adapter; this package does not magically add MCP support to arbitrary models or non-MCP APIs.

## Approval policy for every host

Never autoapprove `tidal_commit_change` or `tidal_disconnect`. Read the target, action, visibility, item count and exact payload before approval. A model should use `tidal_prepare_change`, explain the preview, obtain explicit user consent, then reuse that plan ID/digest. A cancellation only closes a preview; it is not an undo command. On uncertain outcomes, preserve the existing plan and inspect state. Do not “try again” by preparing a fresh duplicate mutation.

Official OpenAI and MCP references are recorded in SOURCES.md. Configuration examples are supplied, not evidence that a specific client version has been tested here.
