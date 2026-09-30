# Data contracts

## Authoritative definitions

`src/core/contracts.mjs` defines the application input schema descriptors and endpoint payload compiler. `docs/tools.json` and TOOL_REFERENCE.md are generated views of those descriptors. `src/core/schema.mjs` implements a reviewed JSON-schema subset and compiles it to Zod for MCP registration. `types/contracts.d.ts` re-exports the official TIDAL `paths` and `components` types and describes the local envelope. The production package has not been TypeScript-compiled in the delivery environment.

## Result envelope

Successful tool calls carry both text JSON and MCP `structuredContent` with the same envelope:

```json
{
  "ok": true,
  "requestId": "opaque-correlation-id",
  "data": {
    "items": [],
    "document": {"data": [], "included": []},
    "status": 200,
    "source": {"tool": "tidal_search", "arguments": {"query": "night", "kind": "tracks"}}
  }
}
```

`data` varies by tool. Page results may include `nextCursor` or `paginationWarning`; status results contain connection/permission metadata; preview results contain the exact mutation; commit results contain applied/partial/status/document. The returned original read arguments are needed when a host opens a fresh UI from a tool result and later asks for the next page. They are user input, not credentials.

Expected failures use:

```json
{"ok":false,"requestId":"opaque-correlation-id","error":{"code":"PLAN_EXPIRED","message":"Preview expired. Prepare and review it again."}}
```

The MCP adapter also sets `isError`. Authentication-related tool failures add a challenge in `_meta["mcp/www_authenticate"]`; HTTP authentication failure is handled before tool dispatch. Callers should branch on stable codes, not English message text. Unknown exceptions are sanitized and do not contain a stack trace or token.

## Normalized item

An item has string `id`, `type`, `title`, an `artists` string array, `explicit`, and the original `attributes`. Optional fields include ISO-duration text, a safe `imageUrl`, a safe TIDAL `url`, and `occurrence` copied from primary linkage metadata. This is a display convenience, not a substitute for the original document. A primary relationship can repeat the same `(type,id)` with different occurrence identifiers; never deduplicate it merely to simplify UI rows.

Unknown output attributes and enum values remain available. Arbitrary output resource types can remain in the raw document but do not automatically become legal tool inputs. The UI renders supplied strings with `textContent`, not as HTML. A description that looks like an agent instruction remains untrusted content.

## Change preview and approval

```json
{
  "change": {
    "action": "remove_playlist_items",
    "playlistId": "opaque-playlist-id",
    "items": [{"type":"tracks","id":"opaque-track-id","itemId":"opaque-occurrence-id"}]
  }
}
```

Prepare returns `planId`, SHA-256 `digest`, `expiresAt`, action, method, path, scope, optional body and playlist guard. The digest binds the compiled request and guard. It is not a credential and is not itself proof that a human approved it. Commit accepts only the same plan ID/digest with `confirm: true`; the server independently verifies client, grant, permissions, state and expiry.

The upstream removal payload keeps occurrence identity inside linkage metadata:

```json
{"data":[{"type":"tracks","id":"opaque-track-id","meta":{"itemId":"opaque-occurrence-id"}}]}
```

Reorder uses `meta.positionBefore` on the outer document plus occurrence identities in `data`. Creation/update use JSON:API resource data and attributes. Collection changes use typed resource identifiers and a server-selected current-user collection path. The compiler, not the model, determines headers and idempotency keys.

## Bounds and invariants

| Input / response | Application boundary |
|---|---|
| Search text | 1–200 characters; no control characters |
| Resource/occurrence ID | 1–256 characters; no standalone dot segments |
| Cursor | Opaque, at most 8,192 characters |
| Playlist name/description | Name at most 255; description at most 10,000; name must not be empty |
| Collection/add/remove batch | 1–50 items |
| Reorder batch | 1–20 occurrences |
| HTTP request body | 128 KiB |
| TIDAL API document | 2 MiB bounded read |
| OAuth token/identity response | 64 KiB bounded read |

These are the package's accepted inputs and safety limits; they are not a universal description of every upstream operation. Input unknown properties are rejected. Object IDs and cursor values are never used to choose an arbitrary external host.

## Compatibility and extension

Add optional output fields rather than changing existing meanings. Keep stable tool/action names; a breaking input change needs an explicit versioning/migration decision. Add an action only with an operation-specific scope, payload compiler, preflight/confirmation policy, safe retry analysis, fixture and negative tests. Keep the generated tool documentation synchronized with `npm run docs`.
