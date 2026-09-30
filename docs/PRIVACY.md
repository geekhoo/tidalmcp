# Data handling and privacy notes

This is an implementation description, not a published privacy policy or legal opinion. The deployment operator must provide its own policy and confirm its permitted use of TIDAL data and third-party agent hosts.

The server stores linked-user identifiers, optional country metadata, encrypted TIDAL grants, MCP authorization records, client registrations, temporary pending login data, write previews and replay results. Current-user profile responses may contain personal fields returned by TIDAL when that tool is requested. Search/library/playlist data is returned to the requesting agent and may be retained by that agent's host under its own policies. The server cannot erase a conversation or another provider's logs.

The application has no analytics service, LLM-provider calls, background music ingestion or tracking SDK. The UI may load artwork from the declared TIDAL image origins and may ask the host to open a TIDAL link after a user action. Those external requests have ordinary network/privacy implications. Demo data is fictional and generated locally, with no real account or catalogue snapshots bundled.

Operational audit records omit access/refresh tokens, authorization codes, queries, arguments, payloads and raw responses. They retain timestamps, request IDs, routes/tool names, timings, status/error codes and hashed principal identifiers. Hashing is pseudonymization, not anonymization. State and audit retention are operator responsibilities; audit logs have no automatic retention/rotation service.

Disconnect removes local authorization for this connection, but does not revoke the separate TIDAL-side grant, delete music data at TIDAL, or delete the agent host's records. Manage the TIDAL app grant through the account's own controls. Do not publish screenshots/logs containing a real user's profile or private playlists without permission.
