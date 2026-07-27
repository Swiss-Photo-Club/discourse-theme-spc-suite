# New pattern: SPC Category Hero

Design-system *extend* spec for community.swissphotoclub.com. Proposes one hero component that
every category page uses, replacing three unrelated header treatments. Companion docs:
`claude/spc-suite-how-it-works.md`, `claude/discourse-configuration.md`.

Status: **executed, 2026-07-26.** Categories 6, 7, 8, 10 and 12 render the shared hero on the
live site. Read §6a before the spec body; then read this note, because execution overrode both
in three further places.

**2026-07-27 follow-up:** the category list and `.category-title-header` anchor described below
have been retired. SPC Suite now owns an `above-main-container` surface, and every category gets
the generic hero unless it has a category-specific override. This document remains the design
history; `README.md` and `CLAUDE.md` describe the current behavior.

- **One `--category` variant, not `--submission` / `--events` / `--plain`.** §6a dropped
  `--events`' meta line as a fetch; `--submission`'s subject chips fall to the same rule. That
  left all three with identical declarations, and "two actions instead of one" is not a CSS
  difference.
- **No `actions[]` in the schema, and no `category_heroes` objects setting.** Four of the five
  categories derive their destinations from other settings plus the locale, so the field could
  not express them. The registry is code, in `api-initializers/spc-category-hero.js`; the setting
  is a plain category list, `hero_enabled_categories`.
- **No `headline` key.** Every category's headline turned out to be its own name, which Discourse
  already localises. Writing it out again only creates a string that drifts from the sidebar.

§1's table is also wrong about where a category header comes from: a site-wide component toggles
between `.category-title-header` and `.list-controls .category-heading`. See CLAUDE.md.

---

## 1. Problem

Category pages currently get their header from one of three unrelated mechanisms:

| Category | Today | Where the primary action lives |
| --- | --- | --- |
| 6 monthly-challenge | `.spc-challenge-hero` — an owned element inserted before `.category-title-header`, which is hidden | inside the hero |
| 7 critique-portfolio-reviews | core `.category-title-header` recoloured to `#FFE8E8` | `.spc-critique-submit`, a right-aligned row floating above the topic list |
| 12 vorstellungen | core `.category-title-header` recoloured to `#E8F0F0` | core `#create-topic` (hidden when `critique_hide_new_topic_button`) |
| 8 meetups-photowalks | stock Discourse | core `#create-topic` |
| 10 support / Post Processing | stock Discourse | core `#create-topic` |
| 11 *(identity not documented)* | stock Discourse **[Unverified]** | — |

Plus a fourth header treatment on the homepage: `.spc-non-member-banner`, which is a
second, independent implementation of the same hero idea.

The divergence is structural, not cosmetic. Harmonising means picking one mechanism —
an owned element above a hidden core header — and giving every category the same one.

### Measured divergence

| | `.spc-challenge-hero` | `.spc-non-member-banner` |
| --- | --- | --- |
| Shell | `min-height 360px`, `padding 3.5rem`, `border-bottom 6px` coral | `min-height 380px`, `padding 52/48/57`, `::after 5px` coral |
| Content column | `min(760px, 68%)`, left-aligned | `max-width 1120px`, centred |
| Eyebrow | `0.75rem` / `800` / `0.12em` / white 74% | `12px` / `800` / `0.16em` / `#ffadae` |
| Title | `clamp(2.7rem, 5vw, 5rem)`, `lh .98`, `ls -.025em` | `clamp(2.5rem, 4vw, 46px)`, `lh 1.08`, `ls 0` |
| Body | `clamp(1rem, 1.5vw, 1.2rem)`, white 82% | `18px`, white 92% |
| Button | `min-height 54px`, `.65rem/1.35rem`, `.78rem`, `ls .08em` | `min-height 46px`, `12px/26px`, `14px`, `ls .04em` |
| Secondary | white 8% fill, white 48% border | transparent, solid white border, inverts on hover |

Eyebrow tracking across the codebase: `.08em` (homepage monthly card), `.12em` (challenge hero),
`.13em` (sidebar section header), `.16em` (non-member banner). Four values for one role.

Four button implementations: `.spc-challenge-button`, `.spc-non-member-banner__button`,
`.btn-primary` in `branding.scss`, and `[data-wrap="primary-button"]`.

Near-miss neutrals: `--spc-challenge-muted: #8a909e` vs `--spc-gray-400: #8e98a8`;
`--spc-challenge-rule: #e2e4e9` vs `--spc-gray-200: #e9ebf8`. Plus roughly a dozen one-off
greys hardcoded in `challenge.scss` (`#5f6470`, `#656a75`, `#676b75`, `#6b707b`, `#c8ccd4`,
`#e9ebef`, `#f3f5f8`, `#fff4f2`).

---

## 2. Proposed component

### Anatomy

```
.spc-hero                     owned <section>, inserted before .category-title-header
  .spc-hero__shade            gradient scrim, z-index -1, only when a cover is set
  .spc-hero__content
    .spc-hero__eyebrow        kicker — category role, not category name
    h1                        the headline
    .spc-hero__lead           one sentence
    .spc-hero__meta           optional status line (deadline, subject list, next event)
    .spc-hero__aside          optional promoted block (winner, pinned notice)
    .spc-hero__actions
      .spc-button--primary    exactly one
      .spc-button--secondary  zero to two
```

Identical markup for every category. What differs is which slots are filled and what the
actions do — never the shell, the type scale, or the button geometry.

### Slots and their per-category source

| Slot | Source | Fallback |
| --- | --- | --- |
| eyebrow | `category_heroes` setting, per slug; translated via `hero.<slug>.eyebrow` | category name, uppercased |
| h1 | `category_heroes` headline, else `category.name` | `category.name` |
| lead | `category.description` (already authored in the admin UI, already translated) | omitted |
| meta | variant-specific, see below | omitted |
| aside | variant-specific | omitted |
| actions | `category_heroes[].actions[]` | core `#create-topic` label, routed to the composer |
| cover | `category_heroes[].cover` upload | flat `--spc-indigo`, no scrim |

Using `category.description` for the lead matters: it is real data already in the database and
already localised, so the hero is not a second place to author copy.

### Variants

| Variant | Categories | What it adds |
| --- | --- | --- |
| `--challenge` | 6 | round tag resolution, deadline meta, winner aside, cover from the pinned topic thumbnail, voting-explainer secondary action |
| `--submission` | 7, 12 | subject/tag chips in meta, two primary-weight routes (image form, project wizard) |
| `--events` | 8 | next-event meta line **[Unverified — depends on whether a date is parseable from the category's topics; if not, drop the meta slot here]** |
| `--plain` | 10, 11 | no cover, no meta, single action |

Variants are **modifier classes on the same element**, not separate components. A variant may
fill extra slots; it may not change the shell, the type ramp, or the button geometry.

### Tokens

Replace the `--spc-challenge-*` alias block entirely. The hero consumes design-system tokens
directly:

| Role | Token |
| --- | --- |
| Shell background | `--spc-indigo` |
| Scrim | `--overlay-hero` (already defined in `branding.scss`, currently unused by the hero) |
| Accent rule, primary fill | `--spc-coral`, hover `--spc-coral-hover` |
| Eyebrow | `#ffffff` at 74%, tracking `--ls-kicker: 0.12em` (new token) |
| Muted text on light | `--spc-gray-400` — retires `--spc-challenge-muted` |
| Hairline | `--spc-gray-200` — retires `--spc-challenge-rule` |
| Surface | `--spc-wild-sand` |
| Highlight aside | `--spc-casablanca` |

New tokens to add: `--ls-kicker: 0.12em`, `--ls-button: 0.08em`, `--h-hero-action: 54px`.
These three values are what the four existing button implementations disagree about; naming
them is what stops the divergence recurring.

### States

| State | Behaviour |
| --- | --- |
| Default | hero renders from settings + category model, no network call |
| No cover | flat `--spc-indigo`, `.spc-hero__shade` omitted, no scrim |
| No actions configured | actions row omitted entirely; core `#create-topic` stays visible |
| Loading (challenge variant only) | hero renders immediately with eyebrow, title, lead; meta and aside fill in when the challenge fetch resolves — never a spinner, never a layout shift beyond the meta line |
| Fetch failed (challenge) | meta and aside stay omitted; hero still correct |
| Not permitted to post | primary action hidden, secondary actions kept |

### Accessibility

- `<section aria-labelledby="spc-hero-title">`, `h1` carries the id. One `h1` per page —
  the core `.category-title-header` is display-none, so no duplicate heading.
- Eyebrow is a `<span>`, not a heading — it is a label, not a level.
- Actions: `<a>` when they navigate, `<button type="button">` when they open a dialog or
  intercept. The current challenge hero already does this correctly; keep it.
- Contrast: white on `--spc-indigo` (#1a2744) is ~14:1. White at 62% for meta is ~8:1 — passes.
  White at 48% would not; do not lighten the meta further.
- The scrim must render *behind* text via `z-index: -1` on an absolutely positioned child, as
  the challenge hero does now, so text is never inside a stacking context that can invert.
- `@media (prefers-reduced-motion: reduce)` — no transitions on hover states.

### Do / don't

| Do | Don't |
| --- | --- |
| Insert an owned `<section>` before `.category-title-header` and hide the core node in CSS | Rewrite `.category-title-header` in place — Ember keeps that node across category navigation, which is exactly the bug the challenge hero already had and fixed |
| Give a category a hero only when it has a real action | Add a hero to every category for symmetry and leave the actions row empty |
| Read the lead from `category.description` | Author a second copy of the description in a setting |
| Keep a variant's extra data in the meta/aside slots | Let a variant change padding, type scale, or button size |

---

## 3. How each category's functionality folds in

This is the part that distinguishes harmonising from copy-pasting. Each category keeps its own
behaviour; only its *presentation* is absorbed.

**6 — monthly-challenge.** No behaviour change. `.spc-challenge-hero` becomes
`.spc-hero.spc-hero--challenge`; the round-tag resolution, deadline computation, voting dialog
and winner line move from bespoke markup into the meta and aside slots. The `data-spc-submit-photo`
button keeps its capture-phase interception verbatim.

**7 — critique.** The pink `.category-title-header` recolour is deleted. `.spc-critique-submit`,
the floating right-aligned button row, is deleted as a layout element — its two buttons become
the hero's primary and secondary actions, keeping their existing handlers, so
`critique_image_use_form` still switches the first button between `/submit/critique` and
`critique_image_wizard_url` with no code change. The subject tag list, already fetched live from
`/tags/filter/search.json`, populates the meta slot — it becomes a visible affordance rather than
only a dropdown. The leaderboard strip stays where it is, below the hero, restyled to the shared
hairline and type. `critique_hide_new_topic_button` keeps working; the hero now supplies the
action it hides.

**12 — introductions.** The teal recolour is deleted. Primary action points at
`onboarding_introduce_url_{de,en,fr}` — the same wizard URL the onboarding panel already uses,
read from the same settings, so the two never drift. Secondary action links the guide topic.

**8 — meetups.** Gains a hero for the first time. Primary action is
`settings.webinars_url` (`/upcoming-events`); secondary opens the composer for a meetup
proposal. No new data fetch.

**10, 11 — support / Post Processing.** `--plain` variant. Single action opening the composer.
These are list-mode categories (`list_categories = 10` in Topic List Thumbnails), so the hero
sits above a list rather than a masonry grid — the shell is unchanged, only the surface below it
differs.

**Homepage — `.spc-non-member-banner`.** Not a category, but it is the fourth hero
implementation and the reason the language looks accidental. Reduce it to
`.spc-hero.spc-hero--invitation`: same shell, same buttons, existing join-URL settings and
group-gating untouched. This is a pure CSS/markup change with no behaviour change, and it is
the single highest-value item in the whole proposal because it removes the duplicate
implementation rather than adding a third.

---

## 4. Implementation in this repo

### Files

- **New** `scss/hero.scss` — the shell, slots, buttons, tokens, responsive rules. Imported in
  `common/common.scss` **immediately after `branding`**, so every later partial can override it
  and the existing cascade order is otherwise untouched.
- **New** `javascripts/discourse/lib/spc-hero.js` — `renderHero(config)`, one exported function.
  Pure DOM, no fetch.
- **New** `javascripts/discourse/api-initializers/spc-category-hero.js` — resolves the current
  category, looks up its config, calls `renderHero`. Gated by a new `enable_category_hero` toggle.
- **Changed** `scss/challenge.scss` — `.spc-challenge-hero` rules deleted; challenge-specific
  deltas only. `challenge.scss` still imports after `hero.scss`, so its overrides win.
- **Changed** `scss/critique-submit.scss` — banner recolour blocks and `.spc-critique-submit`
  layout deleted.
- **Changed** `scss/non-member-banner.scss` — reduced to the `--invitation` variant's deltas.
- **Changed** `spc-monthly-challenge.js` — `renderHero()` delegates to `lib/spc-hero.js`.
- **Unchanged** `challenge-staff.scss` stays last in the import list.

### Settings

New objects setting `category_heroes`, one entry per category, mirroring the shape of the
existing `challenges` setting:

```yaml
category_heroes:
  type: objects
  schema:
    properties:
      slug: { type: string, required: true }
      variant: { type: enum, choices: [challenge, submission, events, plain, invitation] }
      eyebrow_key: { type: string }
      headline: { type: string }
      cover: { type: upload }
      actions:
        type: objects
        properties:
          label_key: { type: string }
          href: { type: string }
          style: { type: enum, choices: [primary, secondary] }
```

New toggle `enable_category_hero`. Category 6 must **not** be gated by it — the challenge hero
is part of the route-map + permalinks + `route:new-topic` stack that the orientation doc
deliberately leaves untoggled, and half-enabling it breaks `/submit`.

Locale namespace `hero.*` — `hero.<slug>.eyebrow`, `hero.<slug>.actions.<key>`. Note
`banner.*` and `nonmember_banner.*` are both taken; `hero.*` is free.

Three settings must not be renamed casually: renaming touches `settings.yml`, the JS, *and* any
SCSS that interpolates them. `hero.scss` should interpolate **no** settings, which keeps the
rename surface at two sites instead of three.

### Render-loop compliance

The generic hero reads only the category model and settings, so it makes **zero network
requests** and belongs in the same class as `spc-homepage.js` and `spc-challenge-vote-mover.js`
— observer pattern, no caching rules needed. The challenge variant keeps its existing throttle,
promise cache, cool-off, gate and TTL. Regression baselines are unchanged and still apply:
a Meetups page must make zero challenge requests even though it now has a hero, and the critique
page must still request `/leaderboard/1.json` exactly once.

### Initializer shape

Use the established pattern: module-scope `spcStartWhenReady(null, spcRun)` top-level kick plus
a retrying `plugin-api:main` lookup via `getOwnerWithFallback`, with the exported `initialize()`
as a second chance. The `__container__` TypeError is expected noise; removing the top-level call
to silence it breaks the initializer.

---

## 5. Risks

- **Canvas width.** Category 6 widens `#main-outlet-wrapper` to `calc(100vw - 4rem)` / max 1500px.
  A hero on a non-widened category will be visibly narrower than the challenge hero, which
  undercuts the harmonisation. Either widen all hero categories or widen none — but widening
  categories 7, 11 and 12 changes the available width for **masonry**, and Topic List Thumbnails
  measures every row and absolutely positions it. Test the masonry categories specifically after
  any width change.
- **Masonry desync.** The hero sits above the topic list and adds no height to `tr.topic-list-item`,
  so it is safe. Do not put any hero-related decoration inside topic rows.
- **`.category-title-header` may not exist on first paint.** `ensureHero()` returns `null` when the
  anchor is missing and the current code handles that. Keep the same guard — a hero that renders
  into `#main-outlet` directly will fight core on navigation.
- **Deleting `.spc-critique-submit`** removes an element other code may query. Grep before deleting.
- **Cover images.** `category_heroes[].cover` uploads live in `about.json` and the theme repo,
  which is where the five branding assets already live and where they exist nowhere else. Adding
  four category covers means four more files that only exist in git and the Discourse database.
  Whether `category.uploaded_background_url` could supply these instead, avoiding the setting
  entirely, is **[Unverified]** — worth checking `GET /site.json` for the field before committing
  to the upload approach.
- **Rollback.** `enable_category_hero = false` restores stock headers for categories 7, 8, 10, 11, 12
  but leaves them *unstyled* rather than restoring the pink and teal recolours, since those rules
  will be deleted. If an instant-rollback path matters, keep the two recolour blocks behind an
  `@if` on a retained setting for one release.

---

## 6a. Resolutions (2026-07-26) — these override §1–§6 where they disagree

Verified against the live site, not against the two project docs.

**Category facts.** There is no category 11; it was a typo for 8. Masonry is **6, 7, 8, 12**;
category 10 is list mode. §1's table calling 8 "stock Discourse" is wrong — 8 is masonry, so it
needs the same verification pass as 6, 7 and 12 after any width change. Category 10's slug is
`support` but it displays as "Post Processing", so match on id, never slug.

**Covers come from the category, not a setting.** `category.uploaded_background.url` is present
in `/site.json`, which Discourse preloads — so covers cost **zero network requests**. Note the
field is `uploaded_background` (an object), not `uploaded_background_url`. Categories 8 and 10
have backgrounds; 6, 7 and 12 do not. **Delete `cover` from the `category_heroes` schema in §4**
and drop §5's "four more files that only exist in git" risk with it. `uploaded_background_dark`
exists and is null everywhere — the hook for the dark scheme.

**Discourse already paints this field, and the hero must suppress it.** "Category background
image" in category settings is the correct field — but Discourse renders it full-bleed as
`background-image` on `<body>`, via a generated rule keyed on the slug (`body.category-support`).
A hero using the same image without suppressing that would show the photo twice, once behind the
whole page and once in the hero. Note the body class uses the **slug**, so category 10's is
`category-support`, not `category-post-processing`.

*Caveat, and it is not the hero's fault:* Discourse serves the **original** upload, with no
optimized variant. Category 8's background is 4032x3024 at **3.0 MB**, category 10's is 1790x1162
at 1.1 MB, and both are already being fetched on every visit to those categories today. Resize
before step 8 ships, or the hero inherits a 3 MB blocking image on a page members hit constantly.

**The `--events` variant is dropped, collapsing into `--plain`.** Its meta line needed a date
source. The Calendar plugin is installed (`/discourse-post-event/events.json` → 200) but returns
no events, and reading it would mean a network request — the exact pattern behind the 429 storm.
§2's own guidance applies: drop the slot rather than fetch for it. Category 8's primary action
points at `/upcoming-events`, where that information already lives.

**Canvas width: change nothing.** §5 frames this as "widen all or widen none" because unequal
hero widths undercut harmonisation. Widening none wins. Masonry desync is the component's
highest-severity failure mode, the difference is invisible to any user (nobody sees two category
pages at once), and a hero matching its own page's content width reads as intentional while one
overhanging its list reads as broken. Revisit as its own all-or-nothing commit if it grates.

**Button geometry: `--h-hero-action: 54px`, `--ls-button: 0.08em`, consumed by `.spc-button`.**
Every category hero identical, as §2 requires. The invitation banner keeps 46px / `0.04em` as
documented deltas — it is not a category hero, and forcing it to 54px would regress a verified
surface to fix an inconsistency nobody can perceive. D2's 42px `--md` is dropped: no consumer,
and onboarding is out of scope. Do not ship unused API.

**Already done, before step 8 starts.** §4's file list is half complete: `scss/hero.scss` exists
and imports immediately after `branding`; `challenge.scss` is reduced to its deltas;
`non-member-banner.scss` is reduced to the `--invitation` variant; the `--spc-challenge-*` alias
block is retired. §6's decisions 2, 3 and 5 are therefore closed — no category 11, the banner is
already folded in (commit `747656d`), and `min-height` is already a variant property rather than
a shared value (core sets none; `--challenge` 360px, `--invitation` 380px).

Still open: what `min-height` a coverless `--plain` hero should use.

## 6. Open decisions

1. Do categories 8, 10 and 11 get covers, or is `--plain` (flat indigo, no photo) the intended
   look for the non-photo categories? Flat is cheaper and arguably better — it makes the
   photo-first categories read as the important ones.
2. Category 11's identity is not documented anywhere in the two project docs; it appears only in
   `masonry_categories = 6|11|7|12`. Confirm what it is before assigning a variant.
3. Should `.spc-non-member-banner` fold in during the same change, or as a follow-up? Same change
   is better design, larger blast radius — it is homepage-wide and member-gated, so it needs a
   logged-out session to verify.
4. Meta-line content for meetups requires a date source. If none is cheaply available, drop the
   meta slot for that variant rather than fetching for it.
5. Does the challenge hero's `min-height: 360px` survive as the shared value? On a category with
   no cover and one action it will feel empty. Suggested: `min-height` becomes a variant
   property — 360px with a cover, 220px without — while padding, type and buttons stay fixed.
