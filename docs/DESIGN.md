# Design implementation

The supplied `design.zip` was inspected as data. Its framework/stack recommendations were not adopted. The application uses plain DOM/CSS and the official MCP Apps client, not a framework-specific component system.

`design-source/` retains the original DESIGN.md and token JSON. `scripts/tokens.mjs` recursively flattens token leaves, resolves references, converts cubic-bezier arrays, rejects cycles/missing references, and emits 155 custom properties in `web/tokens.css`. `audit/design-token-map.json` records the source file hashes, original aliases and resolved values. Generated CSS must not be edited manually.

The visual implementation uses the supplied light canvas, ink text, teal functional accent, subdued borders, pill controls, restrained surface radii, content/chrome measures and semantic interaction/status colors. Source font-family names are retained with system fallbacks. **No font binaries are included or downloaded.** Exact licensed-font rendering therefore depends on fonts already available in the host environment.

The source's dark draft contains only a few overrides. It is retained for provenance but intentionally not activated as a supposedly complete dark theme. The current UI is light, including inside a dark host. Complete and contrast-test a dark semantic set before enabling it; do not invert colors automatically and describe that as faithful token adoption.

Inline mode presents a compact list and user-triggered expansion. Full mode adds search, filters, saved-music/playlist views and editing dialogs. Selection is explicit; the write preview identifies its endpoint, payload, target and digest. Loading skeletons, empty results, inline/modal errors, focus outlines, keyboard-accessible controls, reduced-motion CSS and a mobile layout are implemented. The 390-pixel component check had no horizontal overflow. These checks are not a WCAG certification or a full screen-reader/assistive-technology audit.

`audit/screenshots/desktop.png`, `mobile.png` and `write-preview.png` are actual Chromium renders of the real component source using an injected synthetic-data adapter. They are not ChatGPT screenshots or live TIDAL account screens. The production SDK bundle and host sandbox must still be tested after dependency installation.
