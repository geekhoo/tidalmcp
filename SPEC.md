# Implementation specification and acceptance contract

## Objective

Enable standards-based agents to discover TIDAL music and manage explicitly authorized user playlists and saved collections. Add a portable MCP Apps UI, while retaining complete text/JSON workflows for clients without a graphical host. Apply the supplied semantic design tokens without inheriting its framework prescriptions.

## Delivered implementation boundary

The implementation uses Node.js 22.16+, JavaScript ESM, shared strict JSON-schema descriptors, Zod conversion for the official MCP SDK v2, official MCP Apps helpers, and the official TIDAL API SDK. `types/contracts.d.ts` supplies TypeScript-facing contracts; this is not a fully type-checked TypeScript application.

There are 12 tools, eight change actions and 43 allowlisted API method/path bindings. HTTP clients use resource-bound MCP OAuth. TIDAL OAuth grants remain separate and encrypted. Local stdio uses an explicitly logged-in local profile. UI hosts receive one self-contained bundled HTML resource; non-UI clients receive the same business results.

## Acceptance gates

| Gate | Evidence required | Delivery status |
|---|---|---|
| Core behavior | Strict inputs, OAuth binding/replay, encryption, safe pagination, mutation recovery and HTTP boundary tests | Passed; 65 tests |
| Component behavior | Responsive rendering, previews, confirmation, errors, text safety | Passed; 18 Chromium checks through an injected test adapter |
| SDK integration | Official SDK dependencies installed; stdio protocol and TIDAL SDK adapter tests pass | Blocked by package availability |
| Production build | Single-file MCP Apps resource generated from official extension bundle | Blocked by package availability |
| Live acceptance | Authorized test account, application scopes, read/write canary and hosted client checks | Not run; credentials/deployment not supplied |
| Release security | Dependency/advisory scan, independent OAuth review, deployment checks, full lockfile | Pending |

## Exclusions and constraints

No private/undocumented API scraping, audio downloads, DRM workarounds, unsupported playback claims, CAPTCHA automation, account password collection, AI-provider dependency, analytics SDK or deployment is included. Full upstream API coverage is not implied. A machine-inventory generator is supplied; the full downloaded OpenAPI snapshot could not be created in this environment.

“Any agent” means any agent with a compatible MCP client, suitable transport and authentication support. The UI additionally requires MCP Apps support. A host without write approvals must not receive permission for unattended changes.

## Change discipline

Maintain allowlist, schemas, tests, tools reference and audit findings together. Do not auto-enable new upstream endpoints. Treat a dependency upgrade, authorization scope change, token storage change or expanded external domain policy as a security review trigger. Mark execution evidence separately from source inspection and future acceptance tasks.
