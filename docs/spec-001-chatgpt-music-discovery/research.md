# Research record

Reviewed 1 October 2026 (Asia/Singapore). Three read-only researchers ran using **GPT-6 Luna, max reasoning**: codebase/account boundaries, ChatGPT integration/distribution, and TIDAL API/permission/discovery. The primary agent synthesized their findings and independently inspected source and official documents. No new live music/account calls, mutations, deployments or application test runs occurred.

## Context and source authority

Requested prior chat: `codex://threads/01a0f37f-f919-7f72-96f6-ff1c1ca5e2f7`, titled **Verify deployed TIDAL MCP**. Its latest turn confirms actual Codex inline/expanded rendering and read interactions after earlier unverified statements. Use the superseding follow-up in [MCP_USAGE_AND_UI.md](../MCP_USAGE_AND_UI.md); earlier paragraphs and README still contain stale uncertainty. This is retained prior evidence, not a current ChatGPT acceptance test.

The working tree already contained substantial changes and untracked deployment/test/doc work. Nothing from that work was staged, reverted, overwritten or incorporated into this spec's commit. Historical `audit/` evidence and generated files were not edited. Local source/tests outrank older summary prose for implementation facts.

## Findings and synthesis

| Finding | Evidence | Consequence |
|---|---|---|
| Existing MCP Apps substrate | `src/mcp/server.mjs:7`, `web/embedded.mjs:1`, `package.json` | Reuse official SDK/UI/transport; validate ChatGPT separately. |
| Discovery reads already supported | `src/core/contracts.mjs:3`, `src/core/service.mjs:51` | Track radio/similar tracks and artist releases need no new routes. |
| UI exposes only a subset | `web/ui.mjs:44`, `web/embedded.mjs:4` | Add exploration/trail/explicit policy and user-triggered conversation handoff. |
| Raw documents/profile returned | `src/core/service.mjs:11`, `src/core/tidal-client.mjs:70` | Introduce compact app presentation while preserving generic contracts. |
| New OAuth grant per login | `src/core/upstream-auth.mjs:44`, `src/core/oauth.mjs:67` | A ChatGPT profile needs account-stable identity, not per-grant identity. |
| Principal and private route binding | `src/core/oauth.mjs:111`, `src/core/service.mjs:56` | Reuse verified credentials and `me`; no model-supplied user selector. |
| Refresh single-flight is instance-local | `src/core/upstream-auth.mjs:8`, `src/core/upstream-auth.mjs:50`, `src/core/blobs-store.mjs:64` | Potential stale captured refresh response across CAS retries; coordinated/versioned refresh requires tests. No incident was reproduced here. |
| Native cleanup timer differs from Netlify | `src/main.mjs:29`, `netlify/functions/server.mjs:19`, `src/core/oauth.mjs:124` | Hosted maintenance needs an explicit lifecycle; do not claim native HTTP lacks a timer. |
| DCR clients retained/capped | `src/core/oauth.mjs:23`, `src/core/oauth.mjs:124` | Record maintenance/admission policy before larger rollout. |
| Writes are implemented but disabled | `src/core/plans.mjs:6`, prior live reports | Separate discovery app profile; no write approval inferred. |

The code researcher initially described cleanup as lacking any scheduled timer. Main-agent inspection corrected that to the Netlify entry specifically. The domain researcher initially inferred internal-only mix access from a scope map. Operation-level tier inspection and retained live results corrected that to a scope/tier ambiguity, not proof that private reads cannot work. These corrections are reflected in the specification.

## TIDAL permission: direct verification

Official canonical pages:

- [Developer Terms](https://developer.tidal.com/documentation/guidelines/guidelines-developer-terms): v3.0, stated 6 May 2024; non-commercial/development/Production Mode language and AI restrictions in II.1.19–20.
- [Developer Guidelines](https://developer.tidal.com/documentation/guidelines/guidelines-developer-guidelines): v3.0; III.7 covers AI offerings, subject to express written approval.
- [Design Guidelines](https://developer.tidal.com/documentation/guidelines/guidelines-design-guidelines): attribution and return-to-TIDAL requirements; no assertion of an official product/endorsement.

Browser-text fetching returned an empty parsed page; direct HTTP returned a 472-byte SPA shell. Search supplied indexed official text. To verify the permission clauses against today's served portal rather than rely solely on that index, the main agent fetched the script referenced by the shell, followed its public documentation-module imports, and read the rendered-document source:

| Public asset served on review date | Verification |
|---|---|
| [Portal module](https://developer.tidal.com/assets/index-BU00rsRS.js) | Canonical terms/guidelines slugs resolve to the v3.0 documentation modules below. |
| [Terms module](https://developer.tidal.com/assets/developer-terms-3_0-BhtucITZ.js) | Contains the AI-use prohibitions, non-commercial clause and Production Mode approval text. |
| [Guidelines module](https://developer.tidal.com/assets/developer-guidelines-3_0-DN4FTLfL.js) | Contains express-written-approval qualification and the AI-offering restriction. |

SHA-256 of the fetched document-source text encoded as UTF-8: Terms `3fe0af70268c0d149a22ebf22846db7a0329a123a574db49a1bfa7809d47b0a0`; Guidelines `a8f1435ff8e22381ee7eeec74093cd2facc8f49902f429d0752bf1f5c4a59ed7`. Asset names can change; revalidate the canonical page and its current import at release. No private/internal API was used for this verification. This is factual source research, not a legal certification or claim that an app-specific agreement is absent everywhere.

No app-specific permission evidence was supplied. Accordingly the spec gates new live AI data flows and public release; it does not alter or shut down the existing deployed MCP.

## TIDAL API evidence and limits

Direct JSON retrieval of the [official OAS](https://tidal-music.github.io/tidal-api-reference/tidal-api-oas.json) reported **1.10.145**. It documents track radio/similarTracks and artist relations. `similarArtists` exists upstream but is absent from local `RELATIONS`; it remains excluded. Mix families and recommendation blocks exist and require additional `recommendations.read`; their presence is not authorization or local implementation. Reviewed path inventory did not establish a public listening-history/audio-feature interface. Search history is distinct from listening history.

Some user/profile/playlist/collection/mix operation security arrays contain `r_usr` plus named scopes while operation properties say THIRD_PARTY and the scope map labels `r_usr` INTERNAL. Retained actual-account tests succeeded for profile, owned playlists and saved collections with only named public scopes. Preserve this discrepancy and seek app-specific scope clarification; do not request internal scopes, declare existing calls impossible, or assume new mixes work. Local capability/resource version labels still report 1.10.91. No schema-refresh command or allowlist update was run.

Market/entitlement and production quotas remain application-specific. A fixed numeric quota was not established. Opening a TIDAL link does not prove playback. No player feasibility or music-content rights approval was established by SDK/OAS presence.

A focused follow-up checked current OAS and pinned SDK response declarations: radio returns generic resource identifiers with a string `type`; `tracks` is an example, not an enforced type. `similarTracks` also does not constrain the identifier type to an enum. Candidate retrieval must validate types and expand playlist/items only for returned playlists. The documented `radio.items` include is a possible fixed adapter choice requiring SDK tests, not a new arbitrary-include tool.

## OpenAI and MCP sources

| Official source, accessed during this research | Use |
|---|---|
| [User's Apps announcement](https://openai.com/index/introducing-apps-in-chatgpt/) | Product direction and conversational discovery, not present-day eligibility. |
| [MCP server](https://developers.openai.com/plugins/build/mcp-server), [quickstart](https://developers.openai.com/plugins/build/app-quickstart) | MCP with optional UI; stable HTTPS transport. Older import examples do not require replacing this repo's v2 SDK. |
| [UI guide](https://developers.openai.com/plugins/build/chatgpt-ui), [reference](https://developers.openai.com/plugins/reference) | Standard bridge/resource metadata, result visibility, CSP, dedicated domain and display modes. |
| [Authentication and profiles](https://developers.openai.com/plugins/build/auth) | Discovery, resource binding, per-tool schemes/challenges and top-level stable profile response. Existing upstream OAuth is a separate leg. |
| [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) | HTTP discovery, token resource binding and registration standards; authorization-server implementation details are not prescribed. |
| [Tool design](https://developers.openai.com/plugins/plan/tools), [metadata guidance](https://developers.openai.com/plugins/guides/optimize-metadata) | Intent-focused schemas/descriptions and prompt evaluation. |
| [Connect/test](https://developers.openai.com/plugins/deploy/connect-chatgpt) | Private developer-mode checks and actual host evidence; account/workspace eligibility must be checked. |
| [Plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines) | Third-party authorization/unofficial-connector restrictions, privacy/minimization and truthful behavior. |
| [Remote review](https://developers.openai.com/plugins/deploy/app-review), [submission](https://developers.openai.com/plugins/deploy/submission) | Separate public review, verified publisher, privacy/support/terms/product URLs and scan evidence. |
| [MCP submission conversion](https://developers.openai.com/plugins/guides/submit-claude-plugin), [submission errors](https://developers.openai.com/plugins/deploy/submission-errors) | With MCP/direct-endpoint guidance; conflicts with general ZIP guidance remain to be checked in the live portal. |
| [MCP Apps App API](https://apps.extensions.modelcontextprotocol.io/api/classes/app.App.html), [release notes](https://github.com/modelcontextprotocol/ext-apps/releases) | Standard user-triggered messaging/context handoff and protocol compatibility; not proof of this app's ChatGPT acceptance. |

Important unresolved public gate: current OpenAI guidelines say primarily unofficial connectors/pass-through intermediary offerings cannot be approved. A discovery experience has added product value, but that does not establish an exception or official publisher status. TIDAL approval and OpenAI eligibility must be resolved independently.

Official developer-mode pages and researcher-fetched Help Center material differ in plan/surface wording. This spec deliberately makes no universal plan/region/mobile availability claim; record the intended account's actual eligible surface before testing. UI annotation guidance also has broad side-effect wording that needs reconciliation with necessary operational audit logging during submission review.

## Inspected source snapshot

Base HEAD: `8555a37602c91ff95d1745f84103961a2d857349`, plus existing tracked/untracked work. These hashes identify the inspected working-tree files, not a sealed release manifest:

| File | SHA-256 |
|---|---|
| `src/core/contracts.mjs` | `b7d18dab3578de8d98de6912655744d8f8aa503e5e308ac6eebb076d191e0c10` |
| `src/core/service.mjs` | `a5f8656e8f0ed2d648a3aefab54fd372c5381021f6cefc51aac24db51cb5e4fa` |
| `src/core/oauth.mjs` | `beaafe669e5ad4512644b68060d24b1906b6feb5ad4b229f1976b5a482fe84ca` |
| `src/core/upstream-auth.mjs` | `9a51f79f2b597d6b86b34a3535caa1f00ebd5a38f5ecccdb234cadecc0e0d1e6` |
| `src/core/blobs-store.mjs` | `455a57985f0476e709fcf71c0cafaec89af8a91d67746e253638516dc782782f` |
| `src/mcp/server.mjs` | `ab9b120c069397ae1054b9a6257759f34f6ad7957cdc0ad9707a1c6faa1f7c4d` |
| `web/embedded.mjs` | `df2d950f7035a57ab1c85289f336271d044ff7db6d2343e5722e0fd38b0ef7b1` |
| `web/ui.mjs` | `6e2dc5ba60eb4e6309b374c679e412e1d8fd47fb56ecf117d8aac5ca520d99ea` |
| `netlify/functions/server.mjs` | `ea003c3cfcf9a6be7705f2cdd63d91d108141e03ae90ba8b111c783e044563e4` |

The spec was synthesized after all three researchers reported. A focused read-only review returned a conditional pass with two actionable clarifications: propagate a shared cancellation/deadline through actual network attempts rather than relying on today's per-call timeout, and distinguish a session exploration trail from TIDAL search history. Both were incorporated. Local document-link, requirement-numbering, section/fence and staged-whitespace checks passed; no application test result is inferred from them.

Research/spec authoring is complete; application implementation, permission acquisition, ChatGPT testing and public certification are outstanding work, not claimed results of this task.
