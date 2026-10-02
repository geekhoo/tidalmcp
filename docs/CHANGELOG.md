# Change record

## Documentation and skill update — 2026-10-02

Made `https://tidal.pippinpuffin.com/mcp` the default hosted installation/usage endpoint and deprecated Netlify. Added Codex DCR/read-write setup, OAuth checks, connection migration, read prompts, Fedora operations and the Compose write-override caveat. Updated the installed user-level `tidal-mcp` skill with matching setup and migration guidance. Historical audit/Netlify reports and runtime configuration are unchanged.

## Source delivery 1.0.0 — 2026-09-30

Implemented separate MCP/TIDAL authorization, official SDK adapters, strict tool contracts, catalogue/user workflows, guarded mutation plans, encrypted single-writer state, audit chain, optional semantic-token UI and fictional demo. Added core, HTTP, persistence, SDK and browser test sources and operator documentation.

During source/test review, fixed: array-valued easing token resolution; font-stack variable spelling; host-originated pagination context; to-one cursor rejection; modal-local form error visibility; misleading fictional-data external navigation; missing per-tool auth metadata/challenge fields; read-scope removal on refresh; bounded-reader cancellation; and portable build path handling.

Executed evidence: 65 core tests and 18 Chromium component checks passed. Source/browser findings and blocked SDK/install/build checks are recorded in `audit/REPORT.md`. No live TIDAL, production host or external security scan is represented as passed.
