---
name: SPC Suite
description: The Swiss Photo Club community — a gallery wall with a clubhouse in it.
colors:
  signal-coral: "#ff5b5d"
  signal-coral-hover: "#cd3234"
  deep-gallery-navy: "#1a2744"
  heading-navy: "#1f2b55"
  wall-white: "#f4f4f4"
  page-white: "#ffffff"
  ink-charcoal: "#333333"
  muted-slate: "#6b7280"
  quiet-slate: "#8a909e"
  hairline: "#e2e4e9"
  rule-grey: "#d1d5db"
  badge-tiber: "#0a3039"
  winner-amber: "#e9a13e"
  success-green: "#2e8b3e"
  error-red: "#cd3234"
typography:
  display:
    fontFamily: "Open Sans, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.7rem, 5vw, 5rem)"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Open Sans, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.9rem, 3vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Open Sans, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.02em"
  body:
    fontFamily: "Open Sans, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "150%"
    letterSpacing: "normal"
  label:
    fontFamily: "Open Sans, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 800
    lineHeight: 1.4
    letterSpacing: "0.12em"
  button:
    fontFamily: "Open Sans, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  none: "0"
  avatar: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
  4xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.signal-coral}"
    textColor: "{colors.page-white}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.65rem 1.35rem"
    height: "54px"
  button-primary-hover:
    backgroundColor: "{colors.signal-coral-hover}"
    textColor: "{colors.page-white}"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.08)"
    textColor: "{colors.page-white}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "0.65rem 1.35rem"
    height: "54px"
  button-secondary-hover:
    backgroundColor: "rgba(255, 255, 255, 0.15)"
    textColor: "{colors.page-white}"
  forum-button-primary:
    backgroundColor: "{colors.signal-coral}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.none}"
    padding: "0.65em 1.4em"
  hero-challenge:
    backgroundColor: "{colors.deep-gallery-navy}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.none}"
    padding: "3.5rem"
    height: "360px"
  hero-category:
    backgroundColor: "{colors.deep-gallery-navy}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.none}"
    padding: "3rem"
    height: "300px"
  card-category-compact:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink-charcoal}"
    rounded: "{rounded.none}"
    padding: "{spacing.md}"
    height: "154px"
  card-category-feature:
    backgroundColor: "{colors.deep-gallery-navy}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.none}"
    padding: "18px"
    height: "248px"
  card-topic:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.ink-charcoal}"
    rounded: "{rounded.none}"
  feature-badge:
    backgroundColor: "{colors.signal-coral}"
    textColor: "{colors.page-white}"
    rounded: "{rounded.none}"
    padding: "4px 10px"
  input-text:
    rounded: "{rounded.none}"
    padding: "0.6em 0.75em"
    width: "100%"
  onboarding-panel:
    backgroundColor: "{colors.page-white}"
    textColor: "{colors.deep-gallery-navy}"
    rounded: "{rounded.none}"
---

# Design System: SPC Suite

## Overview

**Creative North Star: "The Gallery Wall"**

Every corner in this system is square, because a photograph is the only thing on
screen allowed to be soft. `branding.scss` opens with `* { border-radius: 0 !important }`
and means it: the interface is matting and frame, and the work is what you look at. White
cards sit a few millimetres proud of a pale grey wall; dark indigo slabs give a photograph a
ground to hang against; a coral rule closes the bottom of every slab like a label under a
print.

But this is a gallery wall with a clubhouse in it, and the difference matters. The system is
**warm and club-like**, not precise, not reverent, not quiet. Type is heavy — Open Sans at 800
across every heading and every button — and the copy is second-person and unguarded ("It
doesn't need to be your best work"). Controls are **solid and unfussy**: square, substantial,
obviously pressable, with no ornament and no cleverness. The warmth is carried by the words and
the photographs; the controls just get out of the way and work. A member who is nervous about
posting their first picture should find nothing here that feels like an institution.

Two things this must never become. **Generic Discourse** — rounded default chrome, blue links,
grey rows of text — is what the whole component exists to overwrite; every override in
`branding.scss` is an argument with it. And **the stock SaaS dashboard** — pill buttons,
gradient cards, soft rounded everything — is ruled out at the root by the radius reset, and
should stay ruled out by taste as well.

**Key Characteristics:**
- Square corners everywhere, enforced globally, with exactly one deliberate exception
- Open Sans in four self-hosted weights, leaning hard on 700 and 800
- Uppercase micro-labels at 0.12em tracking as the system's signature
- Coral as a signal, not a field: one primary action per surface
- Deep indigo slabs and full-bleed photography for anything that wants to be seen
- White cards on a `#f4f4f4` wall, lifted by soft, low-opacity shadows

## Colors

Three colours carry the system — a coral that points, an indigo that grounds, and a near-white
wall to hang things on. Everything else is a grey doing structural work.

### Primary
- **Signal Coral** (`#ff5b5d`): the single action that matters. Primary buttons, the rule under
  every dark slab, the "This month's prompt" badge, the onboarding progress fill and step
  markers, section eyebrows on light grounds. It is inherited from swissphotoclub.com, where it
  is the lead colour; here it is deliberately demoted from field to signal.
- **Signal Coral Deep** (`#cd3234`): the hover and active state for every coral surface. Also
  serves as the system's error red — the same value, reused rather than duplicated.

### Secondary
- **Deep Gallery Navy** (`#1a2744`): the community's lead colour and the one place it parts
  company with the main site. The ground of every hero, every feature card, the site header,
  and the fallback behind any missing cover image. Where the main site would go coral, this
  goes navy.
- **Heading Navy** (`#1f2b55`): a deliberately darker navy used **only** for `h1`–`h4`. Not the
  brand navy, and not an accident — headings are meant to sit heavier than the surfaces around
  them.
- **Badge Tiber** (`#0a3039`): category badge titles, via Discourse's own
  `--category-badge-title-color`.

### Tertiary
- **Winner Amber** (`#e9a13e`): reserved for winners and warnings. The hero's winner callout
  takes a 4px amber border-left; the archive's first card is where it appears at size. Rare by
  design — amber showing up anywhere else dilutes the one thing it means.

### Neutral
- **Wall White** (`#f4f4f4`): the page ground on the homepage and behind every masonry grid.
  The wall the work hangs on, and the reason white cards read as objects rather than as
  background.
- **Page White** (`#ffffff`): cards, panels, the brief, the sidebar, the raised topic toolbar.
- **Ink Charcoal** (`#333333`): body text.
- **Muted Slate** (`#6b7280`): secondary text, sidebar links, card descriptions.
- **Quiet Slate** (`#8a909e`): metadata, timestamps, the square bullet on compact category
  cards.
- **Hairline** (`#e2e4e9`): dividers, card borders, the rule that trails off a section title.
- **Rule Grey** (`#d1d5db`): the heavier stroke, used where a hairline would disappear.

### Named Rules

**The One Coral Rule.** Coral marks the single action that matters on a given surface. A hero
has one coral button and one white-outline one; a feature card has one coral CTA. If a screen
has two coral fills competing, one of them is wrong — pick the one the member came to do.

**The Palette Boundary Rule.** Two colour systems coexist **on purpose**, and the boundary is
absolute. `branding`, `hero`, `challenge`, `homepage`, `onboarding` and `non-member-banner` use
hardcoded `--spc-*` tokens. `submit`, `leaderboard` and `critique-workspace` use Discourse core
palette tokens (`--primary`, `--tertiary`, `--secondary`, `--primary-low`). Those three are the
only files that would survive a dark colour scheme, and a dark scheme is in scope — so never
introduce a literal hex into them, and never make a brand surface depend on a core token that
an admin can repaint.

**The Inherited-But-Demoted Rule.** The palette comes from swissphotoclub.com; the *balance*
does not. The main site leads coral, the community leads navy. Do not "correct" the community
back toward the main site's proportions — the difference is the point.

## Typography

**Display Font:** Open Sans (with Arial, ui-sans-serif, system-ui, sans-serif)
**Body Font:** Open Sans — the same family throughout
**Label Font:** Open Sans at 800

One family, four self-hosted weights. Discourse's native font setting serves only 400 and 700,
so `branding.scss` adds Light (300), Medium (500), SemiBold (600) and ExtraBold (800) under the
same family name — which is why weight 800 is available at all, and why it is used so freely.

**Character:** A humanist workhorse pushed to its extremes. The system lives at 800 for anything
that announces itself and 400 for anything that explains, with very little in between. Tracking
does the expressive work that a second typeface would do elsewhere: negative on display sizes
(`-0.025em`), wide and uppercase on labels (`0.12em`).

### Hierarchy
- **Display** (800, `clamp(2.7rem, 5vw, 5rem)`, line-height 0.98, `-0.025em`): hero headlines
  only. Tight leading and negative tracking make it read as a mass rather than a sentence. The
  category hero steps down to `clamp(2rem, 3.5vw, 3.2rem)` — at 300px tall with a one-line
  category name, the full display size reads as shouting.
- **Headline** (700, `clamp(1.9rem, 3vw, 3rem)`, line-height 1.2): section headings — the
  challenge brief, the archive. Coloured Heading Navy.
- **Title** (800, 24px, `0.02em`, uppercase): the section rail on the homepage —
  "POPULAR CATEGORIES" — with a hairline that trails off to fill the row.
- **Body** (400, 16px, 150%): all running text. The challenge brief opens it up to 1.7
  line-height over a 860px measure, which is the most readable text in the system and should be
  the model for anything long-form.
- **Label** (800, 0.75rem, `0.12em`, uppercase): the eyebrow. The signature of the whole system.
- **Button** (800, 0.78rem, `0.08em`, uppercase): every hero and banner action. Discourse's own
  buttons are restyled to match at 700 / `0.04em`.

### Named Rules

**The One Eyebrow Rule.** Every surface that names itself does so with `.spc-eyebrow` —
0.75rem, weight 800, 0.12em, uppercase, white at 74% on dark grounds. One class, no local
copies. Three near-identical eyebrows once existed (`.spc-monthly-card__eyebrow`,
`.spc-challenge-hero__eyebrow`, `.spc-challenge-section-kicker`) at three different tracking
values; consolidating them is what this rule protects. Contextual overrides — coral on light
grounds, pink on the invitation banner — belong in the partial that owns the context and win by
importing later, never by redeclaring the base.

**The Quiet H2 Rule.** `#list-area h2` is 44px at weight **400**, not 700. Big but not loud. It
is the one place the system deliberately declines to shout, and it was a specific request — do
not "fix" it to match the other headings.

## Layout

**Bands, not a page container.** The homepage is a stack of full-width bands, each of which
constrains its own content to `calc(100% - 64px)` capped at **1120px** and centred. Heroes and
the challenge brief are full-bleed and constrain nothing — they run wall to wall and put their
own padding inside. There is a declared `--container-max: 1170px`, but nothing consumes it;
1120px is the number that actually renders.

**The homepage grid is ten columns.** `.featured-categories__list-container` is
`repeat(10, minmax(0, 1fr))` with `18px 14px` gaps. Compact category cards span 2 (154px tall);
the two feature cards — Monthly Challenge and Critique — span 5 (248px tall). That's a
five-across rhythm broken by two half-width slabs, and it is what gives the homepage its shape.

**Order is set by flexbox, not markup.** `#main-outlet` is a column flex container and each band
claims a slot: welcome banner `-30`, onboarding panel `-20`, featured categories `-10`. New
homepage bands take an explicit order value.

**Masonry is a third-party layout and it is fragile.** Topic List Thumbnails measures every
`tr.topic-list-item` and positions it absolutely on categories 6, 7, 8 and 12 (category 10 is
list mode). It measures once and never re-runs. Any change to a row's height desynchronises the
grid and overlaps photographs with text.

**Responsive.** Breaks at 600px (heroes shorten and repad, action rows become single-column
full-width buttons, the submit form loses its outer padding), 650px and 900px (the leaderboard
strip collapses from a 4-up grid to stacked rows), 850px (the onboarding panel's three steps
stack; the critique modal drops from side-by-side to stacked). Both mobile and desktop are
primary usage contexts — a change is not verified until it has been seen on both.

**Spacing.** A 4/8/16/24/32/48/64/96 scale is declared in `branding.scss`. Be aware that it is
mostly aspirational today: only `--space-md` is consumed more than once, and most partials write
literal px. The scale is the intended system; the literals are the observed one.

### Named Rules

**The 1120 Rule.** Content bands are `calc(100% - 64px)`, max 1120px, centred. Heroes are
full-bleed and never take the container. If a new band disagrees with 1120, it is the band that
is wrong.

**The Absolute-Decoration-Only Rule.** On a masonry topic row, add only absolutely-positioned
decoration, and never `display: none` a row or a box inside one. The prompt badge is a
positioned span inside the thumbnail for exactly this reason. Hiding a measured element leaves a
hole the layout will never reclaim.

## Elevation & Depth

**No doctrine governs elevation here yet, and this file will not invent one.** Three shadow
families exist and grew separately:

- the token pair in `branding.scss` — `--shadow-card` / `--shadow-card-hover` — used by homepage
  category cards;
- a navy-tinted pair written literally in `topic-cards.scss` for masonry photo cards;
- one-off panel shadows in `onboarding.scss` and the raised topic toolbar.

What is consistent in practice, and worth preserving until a rule is settled: shadows are **low
opacity (6–14%), large radius, and always downward** — a card sits a few millimetres proud of the
wall, the way a mounted print does. Nothing in the system uses shadow to encode hierarchy, and
nothing is dramatic. Depth is a material fact, not a signal.

Three declared shadow tokens — `--shadow-overlap`, `--shadow-lift`, `--shadow-subtle` — are
consumed by nothing.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)`): homepage category cards at rest.
- **Card hover** (`box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12)`): paired with `translateY(-2px)`
  over 250ms.
- **Photo card rest** (`box-shadow: 0 8px 22px rgba(26, 39, 68, 0.08)`): masonry topic cards.
  Tinted with navy rather than black — a warmer shadow under a photograph.
- **Photo card hover** (`box-shadow: 0 12px 28px rgba(26, 39, 68, 0.14)`).
- **Raised toolbar** (`box-shadow: 0 2px 20px rgba(0, 0, 0, 0.14)`): the homepage topic toolbar,
  which floats over the wall rather than sitting on it.

**Overlays carry depth where shadows can't.** Text over photography is made legible by gradient
scrims, not by shadow: `--overlay-card` (black 68% → 2%, bottom-up) on feature cards, and a
left-to-right navy scrim on hero shades that flips to top-down under 600px so the headline keeps
its ground when the layout stacks.

**Motion.** One easing curve, `cubic-bezier(0.16, 1, 0.3, 1)`, and three durations — 150ms,
250ms, 400ms. Transitions are limited to hover states: shadow, transform, background-colour.
Nothing animates on load.

## Shapes

**Zero radius, globally and aggressively.** `* { border-radius: 0 !important }` on the universal
selector. Because an `!important` declaration on `*` beats an unqualified one at any specificity
and any source order, **every plain `border-radius` elsewhere in this component is dead code.**
An exception has to be a class selector carrying `!important`, and it lives in `branding.scss`
next to the reset so it reads as the argument it is.

Exactly one exception exists: `.spc-leaderboard-strip__avatar` is a circle, because avatars are
portraits of people rather than UI chrome.

The form language that follows from this is rectangles and rules. Structure is drawn with
1px hairlines and coloured edges, never with corners:

- a **6px coral border-bottom** closes the challenge hero; a **5px coral pseudo-element** closes
  the invitation banner (deliberately different thicknesses — matching them would be a visual
  change dressed as a refactor);
- a **4px coral border-top** opens the onboarding panel;
- a **4px amber border-left** marks the hero winner callout; **3–4px tertiary border-left** marks
  a callout or a highlighted block in the critique flow;
- a **14px square bullet** stands in for the category icon on compact cards, coloured per
  category;
- the sidebar's category icons are replaced by **11px squares** of `currentColor`.

### Named Rules

**The Square Corner Rule.** No rounded corners. If a corner must round, it is a class selector
with `!important` in `branding.scss`, and it needs a reason as good as "this is a photograph of
a person".

**The Edge-Not-Corner Rule.** Emphasis is drawn on an edge — a coloured border-top, border-left
or border-bottom — never with a corner, a pill, or a capsule.

## Components

### Buttons
- **Shape:** perfectly square (0 radius), 54px tall on heroes and banners.
- **Primary:** Signal Coral fill, white text, no border. `0.65rem 1.35rem` padding, uppercase,
  weight 800, `0.08em` tracking.
- **Hover / Active:** fill drops to Signal Coral Deep. No lift, no shadow, no scale.
- **Secondary (on dark):** white text on `rgba(255,255,255,0.08)` with a 48% white border;
  hover raises the fill to 15% and the border to solid white. The invitation banner's variant
  goes further — transparent with a solid white border, inverting to a white fill with navy text
  on hover.
- **Critical detail:** `.spc-button` sets `min-height: 54px` **and** `box-sizing: border-box` in
  the same rule. Without the second, `min-height` sizes the content box and the button renders
  76.8px. Any shared control with a fixed height needs both.
- **Colour is `!important` on button text.** A secondary action is an `<a>`, and something
  outside these files recolours it once visited; primary and secondary both pin white, and
  secondary carries a `:visited` twin.

### Cards / Containers
- **Corner Style:** square, always.
- **Compact category card:** white on the wall, 154px minimum, 16px padding, a 14px coloured
  square bullet above a 16px/700 name and a 2-line clamped description in Muted Slate. Metadata
  pushes to the bottom with `margin-top: auto`.
- **Feature category card:** 248px, spanning half the grid, a cover photograph under
  `--overlay-card`, content bottom-aligned, white type with a soft text-shadow, and a coral CTA
  at 40px tall. Navy fills behind a missing image.
- **Masonry topic card:** white, borderless, `overflow: hidden`, navy-tinted shadow. The
  photograph uses `object-fit: cover` — never `contain`, which letterboxes the moment the
  computed box and the photo's aspect ratio diverge by a pixel.
- **Internal Padding:** 16–18px on cards, 3rem+ on heroes and the brief.

### Inputs / Fields
- **Style:** full-width, square, `0.6em 0.75em` padding, one step up from body size. Bold block
  labels above the field, with `(optional)` / `(required)` as a lighter aside beside the label
  rather than part of it.
- **Focus:** `2px solid var(--tertiary)` outline with a 2px offset on card choosers.
- **Upload zones:** a 1px **dashed** border on a very-low tint — the one dashed line in the
  system, and it means "drop something here". The photo preview claims a 340px minimum and 60vh
  maximum, `background-size: contain`, because the member is checking their own photograph and
  it must not be cropped in the preview.
- **Card chooser:** a real radio input moved out of sight (1px, opacity 0) but never
  `display: none` — that would take it out of the tab order and the accessibility tree, which is
  the only reason to use a real input. Selection is shown by a tertiary border and a very-low
  tertiary fill.

### Navigation
- **Site header:** navy bar, white links at 88% opacity going to 100% on hover, weight 600 at
  0.82rem. No shadow — a single 8% white hairline underneath. Hover does not change weight, so
  nothing jitters.
- **Sidebar:** white, with an 11px `letter-spacing: 0.13em` uppercase section header in Quiet
  Slate at weight 800. Links are 14px/400 in Muted Slate, going navy and weight 700 when active
  on a `#f1f1f1` ground. Monthly Challenge and Critique are permanently emphasised. The admin
  interface is explicitly excluded.
- **Raised topic toolbar:** white, 64px tall, floating on `0 2px 20px rgba(0,0,0,0.14)` over the
  wall.

### Signature: the hero
The one component that defines the system. A full-bleed slab — 360px for the challenge, 300px
for a category, 220px when there is no cover image — with `background-size: cover`, a gradient
shade behind the content at `z-index: -1`, and a coral rule sealing the bottom edge. Content is
left-aligned in a `min(760px, 68%)` column: eyebrow, display headline, one sentence, an optional
status line, then a row of 54px actions. Under 600px it becomes a 440px/320px slab with the
shade flipped to top-down, content bottom-aligned, and actions stacked full-width.

The base class carries only what every hero shares — a full-width, self-clipping flex box with
light text on a dark ground. Everything that answers "which hero is this" is a variant, because
a base that decided padding, height and background would force each caller to spend declarations
undoing it.

### Signature: the eyebrow
Not a component so much as a stamp. `.spc-eyebrow` appears on the hero, the homepage feature
card, the challenge brief, the archive and the voting dialog — 0.75rem, weight 800, 0.12em,
uppercase. It is how a surface says what it is before it says anything else.

## Do's and Don'ts

### Do:
- **Do** keep the palette boundary: `--spc-*` tokens on `branding` / `hero` / `challenge` /
  `homepage` / `onboarding` / `non-member-banner`, Discourse core palette tokens on `submit` /
  `leaderboard` / `critique-workspace`. A dark scheme is in scope and those three are the only
  files that would survive one.
- **Do** pair `min-height` with `box-sizing: border-box` in the same rule on any shared control.
- **Do** reach for `.spc-eyebrow`, `.spc-button` and `.spc-hero` before writing a new class —
  and override them by importing later, not by redeclaring the base.
- **Do** use `object-fit: cover` on any photograph inside a measured box.
- **Do** apply thumbnail centering to `.thumbnail-placeholder` only. Styling
  `.topic-list-thumbnail > a` without keeping `height: 100%` collapses the link to zero height
  and the plugin's absolutely-positioned image then centres around zero.
- **Do** measure **offsets** and not just sizes when a masonry card looks wrong:
  `img.getBoundingClientRect().top − thumb.getBoundingClientRect().top` should be `0`.
- **Do** write new spacing and type against the declared scales, so the token layer stops being
  aspirational.

### Don't:
- **Don't** write a `border-radius` anywhere but `branding.scss`. The universal reset makes it
  dead code, so it will look like a bug that "does nothing" to whoever finds it next.
- **Don't** `display: none` a masonry topic row or any box inside one. Recolour it, move it, or
  cover it — the layout measures once and never reclaims the hole.
- **Don't** put a literal hex in `submit.scss`, `leaderboard.scss` or `critique-workspace.scss`.
- **Don't** create a second eyebrow, a second button base, or a second hero shell. Three
  eyebrows at three tracking values is the exact duplication this system was consolidated to
  remove.
- **Don't** decorate a DOM element Discourse core owns. Core re-renders its own nodes on
  navigation and the two will fight — a correct first paint followed by a broken flash on
  reload. Create your own element or position absolutely.
- **Don't** use a second coral fill on a surface that already has one.
- **Don't** reach for rounded pills, gradient fills, or illustration blobs. Both confirmed
  anti-references — generic Discourse and the stock SaaS dashboard — enter through exactly those
  three doors.
- **Don't** let amber appear outside winners and warnings.
