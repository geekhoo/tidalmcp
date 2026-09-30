---
name: ArrowJS Starter — Markefin
description: The Markefin Design System extracted from the Figma component library and applied to an ArrowJS starter. Warm ink on warm paper, Satoshi, near-square panels, pill controls.
colors:
  ink-900: "#2a302e"
  ink-700: "#5f6563"
  ink-500: "#8c8c8c"
  stone-400: "#b9bcb8"
  stone-300: "#cfceca"
  stone-200: "#e2e1de"
  stone-100: "#eeedea"
  paper-100: "#fafaf9"
  paper-50: "#fcfcfc"
  white: "#ffffff"
  teal-700: "#2c5d63"
  teal-900: "#1c3f44"
  green-700: "#2e7649"
  amber-700: "#8a6316"
  red-700: "#a8322c"
  sky-700: "#2b6180"
  violet-700: "#5b4a86"
  verdict-true: "#477259"
  verdict-true-tint: "#eaf0eb"
  verdict-false: "#99544d"
  verdict-false-tint: "#f4eae8"
typography:
  body:
    fontFamily: "Satoshi, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.3"
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Satoshi, Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "1.333"
    letterSpacing: "-0.03em"
  lede:
    fontFamily: "Satoshi, Inter, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 500
    lineHeight: "1.3"
    letterSpacing: "-0.03em"
  mono:
    fontFamily: "SF Mono, JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "1.7"
rounded:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  pill: "9999px"
spacing:
  1: "2px"
  2: "4px"
  3: "8px"
  4: "12px"
  5: "16px"
  6: "20px"
  7: "24px"
  8: "32px"
  9: "40px"
  10: "56px"
  11: "72px"
components:
  button-primary:
    backgroundColor: "{colors.ink-900}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink-900}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.md}"
    padding: "24px"
    border: "1px solid {colors.stone-300}"
  field:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.sm}"
    height: "32px"
    padding: "0 10px"
  list-item:
    rounded: "{rounded.sm}"
    padding: "4px 4px 4px 12px"
---

# Design System: ArrowJS Starter — Markefin

## Overview

**Creative North Star: "Warm Ink, Warm Paper"**

Every neutral in this system is warm. The ink is a near-black carrying a green undertone (#2a302e), not a pure grey. The paper is a warm off-white (#fafaf9, #fcfcfc), never `#ffffff` as a page canvas. The borders are warm stone greys that read as pencil rules rather than UI chrome. Against that resting warmth sits exactly one accent — a deep teal (#2c5d63), read from the application's own text-selection colour, which is the system telling you what it considers its voice.

The result is a surface that feels like well-made paper stock rather than a screen. Density is high and type is small — 13px body, 12px mono meta, 11px micro-tags and grid cells — because the system is built for operators scanning grids and forms all day, not for readers arriving fresh. Nothing shouts. Contrast comes from weight and rule lines, not from colour.

**Key Characteristics:**
- Warm neutrals throughout — ink, stone, and paper all carry a yellow-green cast, never neutral grey
- One accent only (teal), sourced from the app's selection colour
- 13px base with 1.3 leading and -0.03em tracking — compact, not cramped
- Pill controls against near-square panels: the shape contrast carries the hierarchy
- 1px stone hairlines as the primary structural device
- Shadows are ink-tinted and always offset; the system is flat, not skeuomorphic

## Colors

### Primary
- **Teal** (#2c5d63): The single accent. Text selection, inline code, focus borders, the terminal prompt glyph, links. Pure function — never decorative fill.

### Ink
- **Ink 900** (#2a302e): Primary text, primary button fill, the brand wordmark
- **Ink 700** (#5f6563): Secondary text and hints — the workhorse muted value (5.9:1 on white). Also icons and the scrollbar thumb.
- **Ink 600** (#757b78): Tertiary text
- **Ink 500** (#8c8c8c): Decorative chrome only. 3.4:1 on white — never body copy.

### Stone
- **Stone 400** (#b9bcb8): Strong rules, hover borders, the notification frame
- **Stone 300** (#cfceca): Default card and field borders, drawer edges
- **Stone 200** (#e2e1de): Subtle dividers, code block borders
- **Stone 100** (#eeedea): Sunken surfaces, disabled fills

### Paper
- **Paper 50** (#fcfcfc): Page canvas, the team settings backdrop
- **Paper 100** (#fafaf9): Window surface, topbar, code background
- **White** (#ffffff): Raised content — cards, fields, the L3 panel

### Status
Success (#2e7649), warning (#8a6316), danger (#a8322c), info (#2b6180), violet (#5b4a86). Each is desaturated relative to a stock palette so it sits inside the warm world rather than fighting it. Every status colour ships with a matching tint at ~10% for backgrounds.

### Verdict
**Verdict true** (#477259) and **verdict false** (#99544d) dress model judgments on answer faces at roughly 60% of status saturation, with tints (#eaf0eb, #f4eae8) behind them. All three judgment inks clear 4.5:1 on their own tints. Status colours stay reserved for system outcomes.

### Named Rules
**The Warm Neutral Rule.** No neutral in this system is a pure grey. If a value has equal R, G, and B, it is wrong. Warm it toward the ink hue.

**The Single Accent Rule.** Teal appears on selection, code, focus, and the prompt glyph. It does not appear as a card background, a decorative band, or an illustration colour.

**The Judgment Color Rule.** A model's verdict is not a system error. Verdict colours touch the verdict word and at most a 3px strip — never the whole face. Status danger is reserved for actual failure.

**The Judgment Ladder.** Confidence decides how loudly the verdict word wears those colours. `firm` (70%+) takes the full verdict colour, bold, with a 3px solid underline in the same colour. `leaning` (55–69%) stays in primary ink, bold, underlined with a solid rule. `toss-up` (below 55%) drops to secondary ink with a dashed rule. The two quiet tiers carry an explicit word — *leaning*, *toss-up* — so a tentative verdict still reads as a judgment, never as an absent one.

## Typography

**Display + Body Font:** Satoshi (Fontshare) with Inter → system-ui fallback
**Mono Font:** SF Mono → JetBrains Mono → ui-monospace

**Character:** Satoshi is a geometric grotesque with a slightly narrow set and a warm temperament that matches the ink. It has no italic in the free tier, which suits a system that never uses italic. Tracking is tightened to **-0.03em globally** on `body` — this is the system's signature and it applies to every UI string, not just headings. (One exception: the `j/t` brand glyph keeps logotype tracking at -0.08em.)

### Hierarchy
- **Lede** (500, 40px, 1.3 leading, -0.03em): The one oversized statement per page. `text-wrap: balance`, max 22ch. Weight 500, not 700 — Satoshi at 700 is louder than this system allows.
- **Title** (500, 24px, 30px): Page-level headings — the 404 title
- **Block title** (500, 15px, 20px): Section headings inside the shell
- **Card title** (500, 15px, 20px): Card headers
- **Body** (400, 13px, 1.3 leading): All prose and card copy. Secondary text stays at 13px and changes colour, never size
- **Meta / secondary** (500, 11px, 12px): Footer, list empty states
- **Mono** (400, 12px, 1.7): Code blocks and the command surface only

### Named Rules
**The Three-Weight Rule.** Only 400, 500, and 700 load. Body is 400, every heading and control is 500, 700 is reserved for emphasis inside running copy. Weight carries hierarchy; size changes only at real structural boundaries.

**The No-Eyebrow Rule.** No kicker or label sits above a heading. Headings carry their own weight — a 15px medium Satoshi title over 13px body is sufficient signal in this system.

## Layout

Two nested measures. The **topbar and footer** span a fluid container up to **880px**. The **content shell** is capped at **720px**, centred, which keeps prose inside a comfortable measure and gives the page a deliberate narrowness against the wider chrome.

Vertical rhythm steps through **56px** between top-level blocks and **72px** of bottom padding — generous separation with tight groups inside each card. Cards sit in an auto-fit grid at a **320px** minimum column, collapsing to one column at 720px.

## Elevation & Depth

The system is fundamentally flat. Structure comes from 1px hairlines and surface tinting; shadows exist only to separate a raised surface from its canvas, and never to decorate.

### Shadow Vocabulary
- **xs** (`0 1px 1px rgba(42,48,46,.04), 0 1px 2px rgba(42,48,46,.06)`): Cards at rest, the command surface
- **sm** (`0 1px 2px rgba(42,48,46,.06), 0 2px 6px -2px rgba(42,48,46,.1)`): Card hover, primary button hover
- **md** (`0 2px 4px rgba(42,48,46,.07), 0 8px 20px -8px rgba(42,48,46,.16)`): Raised controls
- **popup** (`0 2px 6px rgba(42,48,46,.08), 0 16px 32px -12px rgba(42,48,46,.22)`): Menus, drawers, overlays

Every shadow is **tinted with ink (#2a302e), never black**, carries a positive Y offset, and has a soft blur. There is no zero-offset halo anywhere in the system.

### Named Rules
**The Ink-Tint Rule.** Every shadow colour is `rgba(42, 48, 46, α)`. A neutral-black shadow on warm paper reads as dirt.

**The Hairline Rule.** A 1px stone line is the default divider. Structural separation comes from rules, not from borders of colour or thickness.

## Shapes

The radius scale is deliberately **bimodal**, and the contrast is the point:

- **xs (2px) / sm (4px)** — fields, list rows, code blocks, the catalog panel border. Near-square. Content containers look like paper.
- **md (8px)** — cards and panels. Softened, still rectangular.
- **lg (12px)** — reserved
- **pill (9999px)** — every button, every badge, every icon control, every segmented control

A pill button sitting on a 2px-radius panel is the system's most recognisable signature. Controls are rounded; surfaces are not.

## Components

### Buttons
- **Shape:** Fully round (pill). Height 32px (28px in the topbar, 24px for inline icon buttons), 14px horizontal padding.
- **Primary:** Ink 900 fill, white text, no border. Weight 500.
- **Secondary:** White fill, stone 300 border, ink 900 text.
- **Step (round icon):** Square 32×32 with pill radius. Inverts to ink 900 fill with white glyph on hover — the shell's round contained button.
- **States:** hover raises to surface-window plus xs shadow; active drops to a 8% ink wash and removes the shadow; focus-visible uses the teal ring; disabled is stone 100 fill with stone 400 text.

### Cards
- **Shape:** 8px radius, 1px stone 300 border, white fill
- **Padding:** 24px, internal gap 16px
- **Shadow:** xs at rest → sm on hover alongside a border shift to stone 400
- **Structure:** title, copy, then an optional `card__body` that holds the interactive part

### Inputs
- **Shape:** 4px radius, 32px height, 1px stone 300 border, white fill
- **Placeholder:** ink 700 (#5f6563) via the secondary text token — 5.9:1 against white
- **Focus:** border flips to teal; a 22% teal halo paired with a 2px solid teal outline (7:1), so the cue survives on any surface
- **Caret:** teal

### Lists
- Rows are 4px radius, transparent at rest, sitting on paper 100 on hover
- Row removal is a 24px pill icon button, muted by default, resolving to the danger tint on hover
- Empty state is 12px ink 500 copy, never centered, never illustrated

### Code
- Paper 100 background, stone 200 border, 4px radius, 12px mono at 1.7 leading
- Syntax maps onto the palette: keywords teal, strings green 700, functions amber 700, properties sky 700, comments ink 700 (ink 500 fails AA on the code background)

## Do's and Don'ts

### Do:
- **Do** keep every neutral warm. Check that R, G, and B are not equal.
- **Do** apply `-0.03em` tracking globally — it is set on `body` and inherited.
- **Do** give buttons pill radius and surfaces near-square radius
- **Do** tint every shadow with ink at `rgba(42, 48, 46, α)`
- **Do** use teal only for selection, code, focus, and links
- **Do** let weight (400/500/700) carry hierarchy before reaching for size
- **Do** keep body text at 13px and differentiate with colour, not scale
- **Do** theme browser surfaces — selection, caret, scrollbar, focus ring, tabular numerals — from the palette

### Don't:
- **Don't** put an eyebrow or kicker above a heading
- **Don't** use pure `#ffffff` as a page canvas or pure grey as a text colour
- **Don't** use `#000` or neutral-black shadows
- **Don't** load or use italic — Satoshi's free tier has none and the system never needs it
- **Don't** introduce a second accent alongside teal
- **Don't** nest a card inside a card, or wrap every section in a card by reflex
- **Don't** add gradient text, coloured left borders, or decorative blur
- **Don't** exceed 720px for prose or 880px for chrome
- **Don't** use a radius outside the committed set — 2px, 4px, 8px, or pill
