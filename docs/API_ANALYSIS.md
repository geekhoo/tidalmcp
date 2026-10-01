# TIDAL API analysis and supported surface

## Research baseline

The referenced TIDAL Web SDK documentation, the official API SDK source, and published OpenAPI 3.0.1 document were inspected on 30 September 2026. The published document reported API version **1.10.91**. The production adapter declares `@tidal-music/api` **0.47.0**; that is a dependency choice, not a claim that the package was installed here.

TIDAL's API is JSON:API-based and requires bearer authorization. The specification distinguishes accepted authorization flows, scopes and access tiers by operation. It also contains internal and deprecated operations. Consequently, schema presence alone is insufficient permission to expose a tool. Catalogue results can differ by market/account and inaccessible data can be absent or redacted. See the official references in [SOURCES.md](SOURCES.md).

## Implemented method/path map

This table describes **the shipped allowlist**, not an exhaustive or live-verified list of TIDAL capabilities. `docs/endpoint-allowlist.json` is generated from the code and contains 44 concrete method/path patterns. In the following table, alternatives in braces are documentation shorthand, not literal endpoint syntax.

| Method | Path pattern | Application tool/action |
|---|---|---|
| GET | `/searchResults` with `filter[query]`, then `/searchResults/{id}/relationships/tracks` and albums/artists/playlists/videos counterparts using the sole result's `data[0].id` | `tidal_search` |
| GET | `/tracks/{id}`, `/albums/{id}`, `/artists/{id}`, `/playlists/{id}`, `/videos/{id}` | `tidal_get` |
| GET | `/albums/{id}/relationships/items` or `/artists` | `tidal_related` |
| GET | `/artists/{id}/relationships/albums` or `/tracks` | `tidal_related` |
| GET | `/tracks/{id}/relationships/albums`, `/artists`, `/radio`, `/similarTracks` | `tidal_related` |
| GET | `/playlists/{id}/relationships/items` or `/coverArt` | `tidal_related` |
| GET | `/users/me` | `tidal_get_me` |
| GET | `/playlists` with `filter[owners.id]=me` | `tidal_list_playlists` |
| GET | `/userCollectionTracks/me/relationships/items`, and Albums/Artists/Playlists/Videos counterparts | `tidal_list_collection` |
| POST | `/playlists` | `create_playlist` |
| PATCH / DELETE | `/playlists/{id}` | `update_playlist` / `delete_playlist` |
| POST / DELETE / PATCH | `/playlists/{id}/relationships/items` | add / remove / move items |
| POST / DELETE | Each dedicated collection's `/me/relationships/items` | save / remove collection items |

The service constructs every path. There is no arbitrary URL, header, method, user-ID or include-expression tool. Catalogue access uses an application token when configured; user-specific calls use the linked grant. Relationship combinations not in `RELATIONS` are rejected before I/O.

## Available is not the same as implemented

| Family | Decision in this package | Reason / next verification |
|---|---|---|
| Daily mixes | Available in the reviewed schema as a third-party candidate; not exposed | Add only after verifying current scopes, paging/relationships and a real application grant. |
| Other personalized mix resources | Not exposed | Inspect each operation independently rather than inferring access from the daily-mixes family. |
| Search suggestions/history | Not exposed | Current search is deliberate user-initiated catalogue lookup, not history ingestion or autocomplete. |
| Artwork resources | Used only through included display metadata and allowlisted image URLs | No upload/edit or arbitrary image-fetch proxy. |
| Playlist collaboration/invitation operations | Not exposed | They introduce another person's access and require separate authorization/confirmation review. |
| Lyrics, download/manifests and internal playback-related operations | Excluded | Neither a published schema nor a player SDK grants unrestricted content or remote-control rights. |
| Legacy `userCollections` and `userRecommendations` | Not used | The implementation uses dedicated collection resources; future mix support should target the current dedicated family. |
| Artist/label administration, commerce, subscription, financial and device-management families | Outside product scope | Do not expose unrelated account or monetary actions to a music-library agent. |

This is intentionally not a blanket tier classification of every path under those families. The included downloader produces operation-specific evidence, including the exact required-access-tier extension, deprecation markers, security arrays, parameters and body/response references. It never changes the runtime allowlist.

## Contract-to-code decisions

**IDs remain strings.** The adapter preserves catalogue IDs and playlist occurrence IDs separately. User tools select the linked user with `me` instead of accepting another user's ID. Path segments are encoded once, dot segments and control characters are rejected, and cursor contents are not decoded into executable URLs.

**Read query parameters are closed.** Search receives a query, kind, market, explicit-content policy and optional cursor. The code uses bounded, preselected include expressions. Owned-playlist reads set the owner filter. Collection reads deliberately do not add a universal country or page-size parameter. `coverArt` is treated as a to-one relationship and rejects an input cursor.

Artist-track relationship reads set the application-selected `collapseBy=NONE` value required by the upstream API. This parameter is fixed internally rather than exposed as a new tool input.

**Responses retain evidence.** `items` is a convenience projection of primary data/linkage; `document` preserves the original JSON:API response. Missing includes are not invented. Duplicate playlist entries and their linkage metadata are preserved. Unknown enum values are not rejected by the output normalizer. A cursor is extracted only from a safe link to the same origin and exact current route; the next request is rebuilt from the original validated arguments.

**Mutation schemas are action-specific.** Creation and metadata updates expose only name, description and supported visibility values. The app defaults creation to `UNLISTED` and labels it as accessible by link, not private. Add/remove actions cap batches at 50; reorder caps at 20. Removal/reorder requires occurrence IDs. Empty updates and duplicate collection IDs fail locally. Omitting a field leaves it out of the upstream payload; the app does not currently expose `null` field-clearing semantics.

**Writes have a persisted identity.** A preview contains the exact compiled method, path and body, scope, target guard and digest. The first application assigns a persisted idempotency key; subsequent retries reuse it. The application deliberately uses a 55-minute retry budget, shorter than the replay interval described by the reviewed API. A successful response can still contain `meta.skippedItems`, so the result distinguishes partial success rather than claiming every requested item changed.

**Error classes are not collapsed.** Authentication, missing scope, forbidden resource, absent resource, bad payload, rate limit, conflict and uncertain outcome have distinct safe codes. Raw upstream exception text is not shown. A 403 is not automatically “fixed” by refreshing forever. An uncertain write is never silently converted into a fresh request with a new key.

## Full inventory and drift workflow

```sh
npm run schema:refresh
```

With network access, this downloads the official JSON into `docs/upstream/tidal-api-oas.json`, records its SHA-256/version, inventories **every method in that downloaded document**, emits an endpoint table, and compares the selected allowlist against the downloaded tiers/deprecations. Those generated full-snapshot files are not in this delivery because the raw download was unavailable to the build runtime. The web-readable schema was used for research; it is not falsely represented as a locally archived complete snapshot.

Review any drift manually. Compare required query parameters, accepted includes, discriminators, relationship identifier metadata, limits, scope definitions and error contracts. Update tests with captured, redacted, legally usable fixtures from your own authorized test account. Never auto-enable an operation just because its tier changed or its name resembles a supported endpoint.

## Live acceptance priorities

Verify search includes/market behavior first; then `/users/me`, owned playlists and each dedicated collection. Only after explicit opt-in, create one clearly labelled unlisted canary playlist, add one chosen catalogue track twice, remove only one occurrence, reorder a small set, inspect metadata changes, and delete the canary. Confirm account ownership and review all changes. The release checklist in TESTING.md requires human approval and records actual—not synthetic—outcomes.
