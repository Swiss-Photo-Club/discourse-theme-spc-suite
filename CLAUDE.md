# SPC Suite — working notes for Claude Code

One Discourse **theme component**, id **61**, "SPC Suite", attached to Foundation + Horizon on
`community.swissphotoclub.com`. Hosted install: **no server access, no git on the host, admin
panel only.** This repo is the source of truth. Ten features live in this one component because
`about.json` must sit at the repo root.

## The iteration loop

**commit → push → press Update in Admin → Components → verify on the live site.**

The component was installed from a git URL, so Discourse shows an Update button when `origin`
moves ahead and the component id stays stable. **Never fix anything in the admin CSS editor** —
a git-installed component is overwritten on the next Update.

An Update **preserves the value of every setting whose name is unchanged** and **resets a
renamed setting to its new default**. So renaming a setting in `settings.yml` silently reverts
its live value. Check the settings page after any rename.

There is no CI and no test suite. Verification is: compile locally (below), push, Update, look
at the site.

## Traps that have actually bitten

**SCSS partials are imported by BASENAME, never by path.** Discourse uploads `scss/` as
`extra_scss` fields keyed by basename, so `common/common.scss` must say `@import "branding"`,
not `@import "scss/branding"`. The path form fails to resolve and Discourse then serves the
stylesheet as **~300 bytes of CSS comment** — the entire site loses its styling, **with no error
anywhere in the admin UI.** Diagnose in the browser console:

```js
fetch([...document.querySelectorAll('link[rel=stylesheet]')]
  .map(l=>l.href).find(h=>h.includes('common_theme_61_')))
  .then(r=>r.text()).then(t=>console.log(t.length, t.slice(0,120)))
```

Healthy is ~75KB starting with `@font-face`.

**The import order in `common/common.scss` is load-bearing** and reproduces the cascade the
seven original components used to produce. Two positions are load-bearing at the ends.
**`challenge-staff` must stay last** — it re-shows the staff topic-admin wrench purely by being
later in the cascade than the rules that hide the footer actions. **`hero` must stay second,
right after `branding`** — it holds the shared primitives, and everything that overrides them
(`challenge`'s contextual eyebrow rules, `non-member-banner`'s `--invitation` variant) does so
by importing later rather than by out-specifying them.

**`branding.scss` opens with `* { border-radius: 0 !important }`.** An `!important` declaration
on the universal selector beats an unqualified one regardless of specificity or source order, so
any plain `border-radius` anywhere else in the component is dead code. Exceptions must be a
class selector carrying `!important`, and they live in `branding.scss` next to the reset.

**Renaming a setting has THREE edit sites** — `settings.yml`, the JS (`settings.foo`) and the
SCSS (`$foo`). `scss/critique-submit.scss` is the one partial that interpolates settings.

**Renaming a CSS class can break behaviour with no visual symptom.**
`spc-photo-submit.js` matches `.spc-hero__actions .spc-button--primary` to route the hero's
primary button to `/submit`. Miss that selector in a rename and the page still looks perfect
while the button silently does nothing — a pixel-for-pixel check of category 6 passes. Grep the
JS for any class you rename, and verify renames by *clicking*, not by looking. This is also why
a rename should never share a commit with an import-order change: the two failure modes are
invisible and catastrophic respectively, and a bisect cannot tell them apart.

**`resolve_group_membership` derives its key from the setting name**, so Discourse exposes
`settings.user_in_<setting_name>`. Renaming `onboarding_member_groups` or
`nonmember_member_groups` breaks the fast path; both call sites guard with `Object.hasOwn` and
fall back to comparing `currentUser.groups`, so it degrades rather than breaks.

**Never decorate a DOM element core owns.** Core re-renders its own nodes on navigation and the
two will fight — the symptom is a correct first paint followed by a broken flash on reload.
Create your own element, or position absolutely.

**Masonry is fragile.** Topic List Thumbnails (component 1) measures every `tr.topic-list-item`
and sets `position: absolute`. Any DOM change altering a row's height desynchronises the layout
and overlaps photos with text. On topic rows, only ever add absolutely-positioned decoration.

**Masonry is 6, 7, 8, 12. Category 10 is list mode. There is no category 11.** Verified
2026-07-26 by reading `.topic-thumbnails-*` off each rendered category. This note previously said
`masonry_categories = 6|11|7|12`, which was wrong twice: `11` does not exist and was probably a
typo for `8`, and category 8 — long assumed to be stock Discourse — is masonry. Anything that
changes a category's canvas width has to be verified on **8** as well as 6, 7 and 12.

**Topic List Thumbnails absolutely positions the image inside the thumbnail box, so that box must
keep a real height.** `challenge.scss` styled `.topic-list-thumbnail > a` as a centering flex box,
which was harmless only because it also carried `height: 100%`. Removing the height left the link
at zero height, and the plugin's absolutely positioned image then centred around zero — rendering
at `top: -246px` inside a 493px box, with the parent clipping its upper half and leaving what
looks exactly like a large empty gap in the card. Apply the centering to `.thumbnail-placeholder`
only; leave `> a` alone, which is what the working categories do.

**When a masonry card looks wrong, measure OFFSETS, not just sizes.** This bug survived four
rounds of diagnosis because every size check passed: the image's height equalled its box's height,
`rowHeight − thumbnail − footer` was zero, and the photo metadata matched its files. All true, and
all blind to an element translated out of view. The check that finds it in one pass is
`img.getBoundingClientRect().top − thumb.getBoundingClientRect().top`, which should be `0`.

**Never `display: none` anything the component has measured** — not a row, not a box inside a row.
Topic List Thumbnails measures and positions once and does not re-run on DOM changes: verified by
hiding a row and then deleting it outright on category 7, neither of which moved the others. Two
rules in `challenge.scss` did this and both left holes the moment the grid override went:
`.spc-challenge-official-topic-row` (a whole row) and `.topic-list-item.pinned
.topic-list-thumbnail` (a box inside one). Recolour, move or cover such an element; do not
collapse it.

**Category 6 was a CSS grid until 2026-07-26 and is real masonry now.** For the whole history
before that, `challenge.scss` overrode `> tbody` to `display: grid` with three fixed columns and
forced every row back to `position: relative; inset: auto`, both `!important`, so Topic List
Thumbnails' positioning never took effect there. That was not a workaround for masonry being
fragile — it was downstream of one declaration, `.topic-list-thumbnail { height: 245px }`. Fix
every thumbnail to the same height and every card is the same height, and once rows are uniform a
grid is the honest layout.

Removing the fixed height removed the reason for the rest, and **all four categories now behave
the same way: 6, 7, 8 and 12 are genuinely JS-positioned masonry, 10 is
`topic-thumbnails-list`.** The desync failure mode therefore applies to all four, category 6
included — it is no longer the safe exception it used to be.

That conversion took five attempts on the live site, and every wrong turn is written up in the
three notes above. Read them before touching this layout again.

The real category set is 6 `monthly-challenge`, 7 `critique-portfolio-reviews`,
8 `meetups-photowalks`, 10 `support` (displayed "Post Processing"), 5 `announcements-club-news`,
2 `feedback`, 12 `vorstellungen`, 4 `general`, 1 `uncategorized`. Note 10's slug and its display
name disagree, so match on id, never on slug-looks-like-the-name.

## Category heroes

Categories 6, 7, 8, 10 and 12 all render `.spc-hero` through `lib/spc-hero.js`. Category 6 goes
through the same function but is **not** in the registry and **not** gated by
`enable_category_hero` — its hero is part of the route-map, permalink and `route:new-topic` stack
behind `/submit`, and half-enabling that breaks photo submission. Sharing a renderer is not
joining the registry.

**Adding a category is four edits, and the fourth is not in this repo.** The registry entry in
`api-initializers/spc-category-hero.js`, the slug in `$spc-hero-slugs` in `category-hero.scss`,
a locale block in all three `locales/*.yml` — and then **adding the category to
`hero_enabled_categories` by hand on the settings page.** An Update preserves the value of every
setting whose name is unchanged, so raising the default in `settings.yml` only affects a fresh
install. Miss that step and the category renders with no header at all: the CSS has already
hidden the native one.

**Which native header is on screen is decided by another component.** Theme component 5 emits
`body:not(.category-header) .category-title-header { display: none }` and
`body.category-header .category-heading { display: none }` — a site-wide toggle driven by a
per-category setting this component does not own. Today 7 and 8 show the banner while 10 and 12
show the heading. So **always hide both**, as `challenge.scss` already did for 6. Never hide only
the one you happened to see.

`.category-title-header` is hidden but never removed — the hero is inserted immediately before it
and needs it as an anchor.

**Suppressing the category background needs `!important`.** Discourse paints
`category.uploaded_background` full-bleed on `<body>` via a rule it generates into the inline
`#d-styles` block, and that block is injected **after** the theme stylesheet. An unqualified
`background-image: none` loses on source order and the photo renders twice, once behind the whole
page and once in the hero.

**The slug list in `category-hero.scss` is the one place slugs are correct**, because the body
class carries the slug. Everything else matches on id. It is keyed on the slug rather than on
`body:has(.spc-hero)` deliberately: the hero arrives on a 200ms observer throttle, so a
presence-based rule would leave the stock header and the background photo on screen until the
first render, then collapse them.

**`clearHero(marker)` is scoped, and must stay scoped.** Two initializers render heroes now and
both run off their own observers in no fixed order. An unscoped clear meant that arriving on
category 6, the category module saw a category it does not own and deleted the challenge hero
that had just rendered. `spc-category-hero.js` clears only markers in its registry; the challenge
owns the marker `"challenge"`, which is not a category id and so cannot collide.

**Rolling the hero back takes two settings, not one.** `enable_category_hero = false` restores the
native headers, but on 7 and 12 the hero action disappears while `critique_hide_new_topic_button`
keeps `#create-topic` hidden — leaving both categories with no way to post. Turn
`critique_hide_new_topic_button` off as well. This is why the `@if` block in `critique-submit.scss`
survives even though it looks redundant against the hero's own `#create-topic` rule: that rule is
only emitted while the feature is on.

`critique_banner_background` is declared and unread. R4 keeps the pink banner restorable without a
commit for one release; deleting the setting, not the rule, is what closes that door.

**`min-height` on a flex/inline-flex button sizes the CONTENT box.** `.spc-button` set
`min-height: 54px` with no `box-sizing` and rendered 76.8px on every desktop for as long as it
existed — only the narrow-viewport block set `border-box`, so the geometry was right on mobile
and wrong everywhere else. Any shared control with a fixed height needs `box-sizing: border-box`
in the same rule.

**In a `.gjs` strict-mode template, a block param shadows the HTML element of the same name.** A
param named `option` turns every `<option>` in that block into a component invocation. At risk:
`option`, `input`, `label`, `output`, `select`, `form`, `data`, `time`, `slot`.

**Permalinks match the full request path, query string included.** `submit` matches `/submit`
and nothing else. Every query-param variant of a theme-owned route needs its own permalink row,
which is why modes are carried by the **category** in the destination rather than an extra param.

**YAML 1.1 boolean-key trap:** `yes:` and `no:` as map keys parse as `true`/`false`. The critique
locale block uses `allowed:` / `denied:` for exactly this reason.

## Networked DOM observers — the five rules

Several initializers observe `document.body` with `{childList: true, subtree: true}` and mutate
the DOM in response. That is a feedback loop by construction, and getting it wrong once produced
a site-wide 429 storm. `spc-leaderboard-strip.js` and `spc-monthly-challenge.js` follow all five;
any new networked renderer must too.

1. Throttle on a timer, never `requestAnimationFrame`. `RENDER_THROTTLE_MS = 200`, leading edge.
2. Cache the **promise**, not the value it resolves to — otherwise every render started while a
   request is in flight fires its own duplicate.
3. Never clear a cache in a failure handler without a cool-off. `FAILURE_COOL_OFF_MS = 60000`.
4. Gate on "does this page need the data" **before** awaiting it (`needsChallengeData()`).
5. Expire caches on a TTL, not on every `onPageChange`. `CACHE_TTL_MS = 5 min`.

Regression baselines: a Meetups or Announcements page makes **zero** challenge requests; the
critique page requests `/leaderboard/1.json` **exactly once**.

**Reading a 429:** Discourse's rate limiter returns a **plain-text** body with HTTP 429 and the
ajax error handler `JSON.parse`s it, so the console shows `SyntaxError: Unexpected token 'S',
"Slow down,"…`. Read that as "we tripped the limiter", not as a parsing bug.

## Expected noise — do not "fix" these

- `[THEME NN 'SPC Suite'] TypeError: Cannot read properties of undefined (reading '__container__')`.
  Discourse's own api-initializer wrapper calls `initialize(e)` with `e === undefined`. Every
  initializer therefore uses a module-scope `spcStartWhenReady(null, spcRun)` top-level kick plus
  a retrying `plugin-api:main` lookup. **Removing the top-level call to silence the error breaks
  the initializer.** It sometimes cites theme 58 rather than 61.
- Wizard pages (`/w/<slug>/steps/step_1`) have no header and no sidebar. That is the Custom
  Wizard plugin, confirmed under `?safe_mode=no_custom`.
- One opaque console error on category page load from the core bundle, pre-existing.

## Verifying an SCSS change without pushing

Discourse's pipeline is not reproducible locally, but a dart-sass compile catches syntax errors
and proves what the CSS delta actually is. Stub the settings and asset variables, then compile
with `--load-path=scss`:

```bash
# $foo for every key in settings.yml, plus the five asset vars from about.json,
# written to scss/_zz_settings_stub.scss; entry file prepends @import "zz_settings_stub";
sass --quiet-deps --no-source-map --load-path=scss /tmp/entry.scss /tmp/out.css
```

Compile before and after, diff the two CSS outputs, and confirm the delta is only what was
intended. Keep the stub outside the repo (a second `--load-path`) so it can never be committed,
and generate the entry file from the real `common/common.scss` each run so it tracks the live
import order.

**A raw diff is useless for a refactor** — moving or renaming a rule changes every byte offset.
Two post-processing passes make "no visual change" a proof rather than a claim:

1. **Expand tokens.** Resolve every custom property *this component defines* down to its literal
   hex, recursively (`--fg-3` → `--spc-gray-400` → `#8a909e`). Leave core palette tokens
   (`--primary`, `--tertiary`, `--d-input-*`) unresolved on purpose: those are exactly the ones
   that must stay movable for a dark scheme, so seeing them survive as `var(...)` is the check.
2. **Diff rule identity, not bytes.** Flatten each rule to (at-rule context, sorted selector
   list, sorted declarations) and compare the two sets as multisets. Relocation then registers as
   no change at all, and only real edits show up. For a **rename**, first apply the same class
   mapping to the baseline — then identical output proves the rename was pure.

Rule identity proves the same rules *exist*; it does not prove their **order** is harmless. Order
only matters between equal-specificity rules touching the same property, so pair it with a grep
showing that no partial between the old and new import positions mentions any moved selector.

None of this catches the basename-import trap, and none of it covers JS. **A class rename must be
verified by clicking, not by looking** — see the rename trap above.

## Parse-checking the JS without pushing

A syntax error in one `.gjs` takes the whole theme's JS down, and nothing in the admin UI says
so. There is no build here, but the two libraries Discourse's own pipeline uses will parse the
tree from a scratchpad, with nothing added to the repo:

```bash
npm install --no-save content-tag @glimmer/syntax @babel/parser
```

Walk `javascripts/`, run each `.gjs` through `content-tag` (this is what catches a malformed
`<template>`), parse each extracted template with `@glimmer/syntax` so template errors are
reported as template errors, and parse the emitted JS with `@babel/parser` — with the
`decorators` plugin, because `@tracked` / `@action` / `@service` appear in plain `.js` files here
too and node's own parser rejects them.

**This proves the files parse and nothing else.** It cannot see a wrong selector, a getter the
subclass forgot to define or an action wired to the wrong handler, all of which render a page
that looks perfect and does nothing. Clicking is still the verification.

## Assets, locales, colours

`assets/` carries the five branding files (Open Sans ×4 + `JWIM4133.jpg`), declared in
`about.json` and referenced in SCSS as `$OpenSans-Light` etc. **They exist nowhere else outside
the Discourse database — do not delete them.**

Locale namespaces are per feature: `critique_workspace.*`, `critique_submit.*`, `critique_form.*`,
`onboarding.*`, `nonmember_banner.*`. Note `banner.*` is already taken by the submit banner,
hence `nonmember_banner.*`.

Two colour systems coexist **by design**. `branding`, `hero`, `challenge`, `homepage`,
`onboarding` and `non-member-banner` use hardcoded `--spc-*` tokens. `submit`, `leaderboard` and
`critique-workspace` use Discourse core palette tokens (`--primary`, `--tertiary`, …) and are the
only files that would survive a dark colour scheme. A dark scheme **is** in scope, so keep
hardcoded hex out of those three.

This boundary outranks the consolidation plan where the two collide. D7 wanted one callout
treatment across all three call sites; `.spc-cw-banner` was left on `--tertiary` /
`--primary-very-low` instead, because the only thing D7 would have changed about it was colour,
and it lives in `critique-workspace`. **Unify shape across the palette boundary, never colour.**

## Load-bearing strings

`javascripts/discourse/lib/spc-critique.js` holds every critique heading. They are matched
**literally** by `lib/spc-parse-request.js` to rebuild a request for the workspace modal, and
they reproduce the Custom Wizard's Liquid `post_template` byte-for-byte so wizard-made and
form-made posts stay interchangeable. They live in JS rather than `locales/*.yml` **so a
translator cannot silently break the parser.** Changing a heading means editing three places:
`spc-critique.js`, `spc-parse-request.js`, and the three wizard definitions in the admin.

**Read a wizard's `post_template` at `/admin/wizards/wizard/<id>.json`**, signed in as admin.
The id is the slug with underscores — `bild_zur_kritik_einreichen`, and `_en` / `_fr` for the
siblings. `/w/<slug>.json` is the tempting URL and answers 200, but it carries only steps and
fields: the `actions[]` array, and with it `post_template`, `category` and `tags`, exists
**only** on the admin path. Signed out, `/w/<slug>.json` still answers 200 with
`permitted: false` and `steps: []`, so an unauthenticated check looks like an empty wizard
rather than a permission error.

## Rollback

`critique_image_use_form` off is the instant rollback for the critique form — no commit, no
Update. The seven disabled components (3, 12, 19, 20, 23, 36, 37) are the rollback path for the
merged-in features; their settings are intact in the database. Do not delete them yet.
