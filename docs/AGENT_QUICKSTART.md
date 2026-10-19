# TIDAL MCP agent prompts and quick start

Copy either prompt into your AI agent. Each user authorizes their own TIDAL account. Hosted access requires a compatible MCP client; it does not require installing this repository. Detailed client configuration: [CLIENTS.md](CLIENTS.md).

For agents explicitly sharing the operator's TIDAL account, use a separate [operator-issued bearer token](BEARER_TOKENS.md) per agent instead of the OAuth setup prompt. The access-check prompt below works for either connection mode.

## 1. Connection setup prompt

```text
Connect this AI agent to my hosted TIDAL MCP server:

Endpoint: https://tidal.pippinpuffin.com/mcp
Transport: Streamable HTTP
Authentication: OAuth with public-client Dynamic Client Registration (DCR) and S256 PKCE
Scopes: tidal:read, tidal:write

Use the agent's native MCP configuration. No repository clone, local server, or TIDAL developer credentials are needed.

Open the OAuth consent flow for me to complete. Keep the callback listener running until login finishes. If registration returns invalid_redirect_uri, report the exact callback URI without codes or state so the server operator can approve it. Never expose credentials or tokens.

Reload the agent's MCP connections if needed. Verify access by calling tidal_auth_status({}) and tidal_capabilities({}), and report whether the account is connected and writes are enabled. Configuration or stored OAuth credentials alone do not prove tool access.

Before changing playlists or saved music, show the exact tidal_prepare_change preview and obtain my explicit approval before calling tidal_commit_change. Preserve the existing plan and idempotency identity if a write outcome is uncertain. Do not disconnect my account without explicit approval.

If this agent does not support the required transport or OAuth flow, explain the limitation.
```

For a deliberately read-only connection, replace the scopes with `tidal:read`.

## 2. Dot access-check prompt

```text
Check whether you can use my TIDAL MCP connection at https://tidal.pippinpuffin.com/mcp from this Dot session. Perform only read-only checks; do not change my music, disconnect my account, or alter configuration.

1. Call tidal_auth_status({}) and tidal_capabilities({}) using your actual MCP tools.
2. Report which calls succeeded, connected, writesEnabled, mcpScopes and upstreamScopes. Include safe request IDs. Do not print credentials or personal profile data.
3. If those calls succeed and the account is connected, call tidal_search({"query":"Daft Punk","kind":"tracks"}) once. Report whether the live search succeeded and show up to three returned track titles and artists. State the market used if it is available; do not invent results.
4. Distinguish connection status, verified live catalogue access, and write configuration. Do not test a write or claim that a read proves writes work.
5. If tools are missing, say access is unverified in this session and identify whether the connection needs enabling, OAuth login, or a session reload. If you cannot determine the cause, say so. If a call fails, report its safe error code and the next step.

Do not claim readiness based only on a configured URL, OAuth status, /healthz, or opening /widget.html.
```

## Quick start

After the access check succeeds, try these requests:

| Task | Ask Dot |
|---|---|
| Search | Search TIDAL for Daft Punk tracks in SG and show a few results. |
| Inspect | Inspect the first returned track and show its album and artists. |
| Related music | Show related tracks for that track using supported relationships. |
| Saved music | Show my saved albums. Fetch the next page if available. |
| Owned playlists | List my owned playlists, then let me choose one to inspect. |
| Open TIDAL | Give me the TIDAL link for that track so I can listen there. |
| Prepare a change | Prepare an unlisted playlist with these selected tracks. Show the exact preview and wait for my approval before creating it. |

Choose a market appropriate to your account; SG is an example. Reuse returned IDs and pass `nextCursor` unchanged with the original read arguments. Search uses `tidal_search`, inspection uses `tidal_get`, related music uses `tidal_related`, and library browsing uses `tidal_list_collection` or `tidal_list_playlists`. Full schemas: [TOOL_REFERENCE.md](TOOL_REFERENCE.md).

Library changes use `tidal_prepare_change` followed by `tidal_commit_change` only after approval of the exact preview. Write-enabled access is not approval for a particular change. On an uncertain outcome, preserve the existing plan and inspect state; do not prepare a replacement mutation.

MCP Apps UI is optional and depends on host support. Text/JSON tools remain usable without it. Opening a TIDAL link does not confirm playback; this MCP provides no playback control or audio downloads.
