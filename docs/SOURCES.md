# Official sources and provenance

Reviewed 30 September 2026. These are references used to select and inspect contracts, not evidence of a successful dependency installation or live API call. Web pages and main-branch files can change; rerun the inventory, preserve a real lockfile and record actual versions during acceptance. No third-party blog or unofficial TIDAL reverse-engineering library is a runtime authority.

| Reference | Use |
|---|---|
| https://tidal-music.github.io/tidal-sdk-web/index.html | User-supplied official Web SDK entry point |
| https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json | Published OpenAPI, reported 3.0.1 / API 1.10.91; method/tier/contract review |
| https://developer.tidal.com/documentation/api-sdk/api-sdk-authorization | Official authorization guidance |
| https://github.com/tidal-music/tidal-sdk-web/blob/main/packages/api/package.json | API SDK package metadata, declared version 0.47.0 |
| https://github.com/tidal-music/tidal-sdk-web/blob/main/packages/api/src/api.ts | Credentials-provider factory, JSON:API/auth middleware and retry switch |
| https://github.com/tidal-music/tidal-sdk-web/blob/main/packages/api/src/index.ts | Exported client factory and generated paths/components types |
| https://github.com/tidal-music/tidal-sdk-web/blob/main/packages/auth/README.md | Auth SDK lifecycle and browser context |
| https://github.com/modelcontextprotocol/typescript-sdk | Official MCP TypeScript SDK; v2 split packages selected for this implementation |
| https://ts.sdk.modelcontextprotocol.io/v2/ | Version-specific official SDK reference |
| https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/node/src/streamableHttp.ts | Native Node Streamable HTTP adapter source |
| https://github.com/modelcontextprotocol/ext-apps | Official MCP Apps extension; selected package version 2.0.3 |
| https://github.com/modelcontextprotocol/ext-apps/blob/main/src/server/index.ts | Official tool/resource helper metadata normalization |
| https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html | UI app connection, host context and host-mediated interactions |
| https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization | MCP authorization boundary and resource binding |
| https://modelcontextprotocol.io/extensions/apps/overview | Optional UI extension and host portability |
| https://developers.openai.com/plugins/build/chatgpt-ui | Standards-first `_meta.ui.resourceUri` and MCP Apps bridge guidance |
| https://developers.openai.com/plugins/build/auth | OAuth discovery, DCR, per-tool auth metadata and current callbacks |
| https://developers.openai.com/plugins/reference | ChatGPT compatibility metadata and approval-gated UI behavior |
| https://developers.openai.com/codex/mcp | Codex/host transport and configuration documentation; redirects to current product docs |

Some OpenAI quickstarts still show the monolithic v1 SDK import. This package deliberately follows the inspected official SDK v2 split-package source rather than mixing v1 imports with v2 extension peers. This decision still needs the recorded SDK integration tests to run successfully.

Recorded Git blob identifiers from source inspection: TIDAL `api.ts` `37fcb9d181876d3b56b26cbaed20118cba23b456`; TIDAL API `index.ts` `dd99257aec87b1f8f8a5ac888e14833d209daa8d`; MCP Apps server helper `5fad055a0aa2fd04ec51f848d19d6722fcb276ac`. These are upstream Git blob IDs, not SHA-256 values for files in this delivery. The delivery SHA-256 manifest is separate.

The design archive is user-supplied material. Its extracted production token file hashes and token-to-CSS mapping are in `audit/design-token-map.json`. No external font file or real TIDAL audio/artwork is redistributed.
