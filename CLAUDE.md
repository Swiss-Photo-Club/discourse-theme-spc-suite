# SPC Suite — working notes for Claude Code

One Discourse **theme component**, id **61**, "SPC Suite", attached to Foundation + Horizon on
`community.swissphotoclub.com`. **Self-hosted: Oğuzhan runs the standard Docker install on his
own server with SSH access** (corrected 2026-08-14 — this file long claimed a hosted install
with admin panel only, and two decisions were wrongly parked on "ask the host"). Server-side
changes (plugin list in `containers/app.yml`, `./launcher rebuild app`) are therefore
self-service, at the cost of a few minutes' downtime per rebuild. Theme work still never needs
SSH: this repo is the source of truth and the admin-panel Update loop below is the whole cycle.
Ten features live in this one component because `about.json` must sit at the repo root.

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
SCSS (`$foo`). `scss/category-hero.scss` is the one partial that interpolates a setting
(`@if $enable_category_hero`).

**Setting descriptions live in TWO layers, deliberately.** `locales/*.yml`
`theme_metadata.settings` wins for the admin's interface language; the `settings.yml`
`description:` is the fallback and what a developer reads in the repo. Every setting carries
both, with de/fr translated — a new setting therefore adds its description in four places
(`settings.yml`, `en.yml`, `de.yml`, `fr.yml`).

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

**An icon this theme uses must be declared in `about.json`, or it silently renders nothing.**
Discourse ships a *subset* of Font Awesome, and it does not scan theme JS for icon names — it
collects them from core's base set, from theme settings whose name contains `_icon`, and from the
`svg_icons` theme modifier. So `@icon="camera"` in a `.gjs` adds nothing to the sprite. `DButton`
renders its `<use>` regardless, so a missing icon is an empty box, not an error: the submit
button's camera was invisible from the day that form shipped until 2026-07-26. Declare every icon:

```json
"modifiers": { "svg_icons": ["camera", "..."] }
```

Check one against the live sprite before trusting it:
`[...document.querySelectorAll("symbol[id]")].map(s => s.id).includes("camera")`.

**A `require()` of a plugin module must run lazily, never at theme module scope.** The theme
bundle can evaluate before the plugin's modules are registered with the loader, so an eval-time
`try { require("discourse/plugins/…") } catch {}` fails once and sticks as null — with the plugin
installed and the same `require` succeeding from the console, which is exactly what makes it
confusing. Resolve inside the component (constructor/instance field) instead; by first render
everything is registered. Bit the Locations picker on 2026-08-14: served bundle had the eval-time
require, page rendered the fallback, console said the module was fine. (A top-level `import` of a
plugin module is worse still: a hard dependency that takes the whole theme's JS down when the
plugin is absent.)

**Never decorate a DOM element core owns.** Core re-renders its own nodes on navigation and the
two will fight — the symptom is a correct first paint followed by a broken flash on reload.
Create your own element, or position absolutely.

Rewriting core-rendered **text** is the worst case of that trap. Setting `textContent` on
`#create-topic`'s `.d-button-label` detached the text node Glimmer tracks, and the next category
transition died in `removeChild` (`NotFoundError`) — which aborts the **whole render
transaction**, so the topic list froze showing the previous category's topics on every navigation
after it (fixed 2026-08-07). Signed-in only, because anonymous pages render no `#create-topic`,
and the crash surfaces nowhere near the code that caused it. A label on a core button rides in a
`data-` attribute rendered through `::before` (see `updateCreateTopicButton`); the composer
relabels in `renderComposer` (`spc-monthly-challenge.js`) use the same `data-spc-label`
pattern, rendered by `challenge.scss`.

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

**The homepage already has a container.** `#main-outlet-wrapper.wrap` is Discourse's 1110px
shell, including its responsive side padding, and `#main-outlet` is the usable content column
inside it. Do not put `calc(100% - 64px)` plus another max-width on Featured Categories, list
controls or onboarding: live measurement showed that combination shrinking those bands to
1024.6px while the banner and topic list remained 1088.6px. Homepage bands use `width: 100%`
and let the core wrapper own the page geometry.

That conversion took five attempts on the live site, and every wrong turn is written up in the
three notes above. Read them before touching this layout again.

The real category set is 6 `monthly-challenge`, 7 `photo-feedback`,
8 `meetups-photowalks`, 10 `support` (displayed "Post Processing"), 5 `announcements-club-news`,
2 `feedback`, 12 `introductions`, 4 `general`, 1 `uncategorized`. Note 10's slug and its display
name disagree, so match on id, never on slug-looks-like-the-name.

**Category slugs are never settings.** Settings hold only category ids; every slug the theme
needs is derived at runtime from `Category.findById(id)` (Discourse preloads all categories
client-side), so a slug rename in category admin is followed automatically. Discourse resolves
`/c/<id>` without a slug, so a failed lookup degrades to an id-only URL, not a broken one. Four
slug settings used to exist and each was a trap: rename the category's slug in admin and the
theme silently kept building URLs from the stale copy.

## Category heroes

Every category renders `.spc-hero` through `lib/spc-hero.js`. The generic path reads the current
category from `router.currentRoute.params.category_slug_path_with_id`, resolves it with
Discourse's `Category.findBySlugPathWithID()`, and needs **no registry or setting entry**. Add an
override in `api-initializers/spc-category-hero.js` only when a category needs actions or an
eyebrow different from `hero.generic`.

Category 6 goes through the same renderer but is **not** on the generic path and is **not** gated
by `enable_category_hero` — its hero is part of the route-map, permalink and `route:new-topic`
stack behind `/submit`, and half-enabling that breaks photo submission. Sharing a renderer is not
sharing a lifecycle.

**The mount is ours.** `components/spc-category-surface.gjs` renders
`[data-spc-category-surface]` through the `above-main-container` outlet on every route.
It is an ordered flex column containing the hero, native category introduction, optional
category-specific sections and the all-category leaderboard. Discourse's `.list-controls` and topic
list stay outside it as adjacent core-owned siblings, so no custom section may be inserted
between the controls and `#list-area`. The stable owned element survives category transitions.
Never go back to inserting relative to `.category-title-header`: that element belongs to the
detachable Category Banners component, and making its hidden output the anchor is what made
component 5 an invisible runtime dependency.

**Category copy already has an admin-owned source.** The shared explanation reads
`Category.description` and links to `Category.topic_url`, the built-in About topic. Do not add a
parallel setting registry for category prose or read-more URLs. The banner image likewise comes
from the category's native `uploaded_background`. The category page keeps Discourse's normal
1110px wrapper; only individual topic-entry pages may opt into a wider canvas.

Category Banners may be attached during the update but should be detached from Foundation and
Horizon afterwards. While it is present, `category-hero.scss` hides both its
`.category-title-header` and core's `.category-heading` on every category route.

**Suppressing the category background needs `!important`.** Discourse paints
`category.uploaded_background` full-bleed on `<body>` via a rule it generates into the inline
`#d-styles` block, and that block is injected **after** the theme stylesheet. An unqualified
`background-image: none` loses on source order and the photo renders twice, once behind the whole
page and once in the hero.

**`clearHero(marker)` is scoped, and must stay scoped.** Two initializers render heroes now and
both run off their own observers in no fixed order. An unscoped clear meant that arriving on
category 6, the category module saw a category it does not own and deleted the challenge hero
that had just rendered. `spc-category-hero.js` remembers the last category marker it rendered;
the challenge owns the marker `"challenge"`, which is not a category id and so cannot collide.

**Native list controls stay native.** `enable_category_hero = false` restores every native
category header and background except the Monthly Challenge, whose workflow stays active. It
does not govern `#create-topic`: logged-in members keep Discourse's New Topic button in the
list-controls bar whether or not the hero is enabled. Category-specific routes redirect that
button to the appropriate SPC submission form.

**`min-height` on a flex/inline-flex button sizes the CONTENT box.** `.spc-button` set
`min-height: 54px` with no `box-sizing` and rendered 76.8px on every desktop for as long as it
existed — only the narrow-viewport block set `border-box`, so the geometry was right on mobile
and wrong everywhere else. Any shared control with a fixed height needs `box-sizing: border-box`
in the same rule.

**In a `.gjs` strict-mode template, a block param shadows the HTML element of the same name.** A
param named `option` turns every `<option>` in that block into a component invocation. At risk:
`option`, `input`, `label`, `output`, `select`, `form`, `data`, `time`, `slot`.

**Tag PAGES need the tag's numeric id; only the `.json`/`.rss` forms still accept a bare
name.** Current Discourse routes browsers to `/tag/<slug>/<id>` (and
`/tags/c/<cat-slug>/<cat-id>/<tag-slug>/<tag-id>`); the old name-only paths survive with a
`format: /json|rss/` constraint, so a fetch of `/tags/c/monthly-challenge/6/winner.json`
works while the same URL without `.json` is a 404 page. Verified live 2026-08-06: the hero's
staff votes link 404'd as a name-based page while the sidebar linked `/tag/2026-07-cityscapes/1`.
Tag ids ride on the tag objects `{id, name, slug}` that topic listings serialize —
`tagPageUrl()` in `spc-monthly-challenge.js` builds hrefs from them; `tagListJsonUrl()` is
for fetches only.

**Localized tag `name` values are display labels, not API route keys.** In German the August
round serializes as `{ name: "2026-08-tiere", slug: "2026-08-animals" }`: the localized-name
JSON route 404s while the canonical-slug route succeeds. Use `tagName()` for rendered copy and
date-prefix matching, and `tagSlug()` for tag URL paths and tag mutation payloads.

**Custom Header Links defaults missing targets to a new tab.** Its renderer sets `_blank` unless
the saved target is exactly `self`, while the target field itself has no default; migrated and
newly incomplete rows therefore open new tabs. `repairInternalHeaderLinks()` removes `_blank`
from every same-origin link in that component and deliberately leaves external links alone.

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

The challenge initializer and staff panel also share the cached in-flight category-listing
promise from `fetchChallengeCategoryTopics()`. Do not put an independent
`/c/<challenge-id>/l/latest.json` request back in the panel: both mount together, and the duplicate
was enough for the panel to intermittently receive a 429 on page load.

Regression baselines: a Meetups or Announcements page makes **zero** challenge requests; the
critique page requests `/leaderboard/1.json` **exactly once**.

**Reading a 429:** Discourse's rate limiter returns a **plain-text** body with HTTP 429 and the
ajax error handler `JSON.parse`s it, so the console shows `SyntaxError: Unexpected token 'S',
"Slow down,"…`. Read that as "we tripped the limiter", not as a parsing bug.

## Expected noise — do not "fix" these

- ~~`[THEME NN 'SPC Suite'] TypeError: … (reading '__container__')`~~ — gone since 2026-08-13.
  Four initializers used to work around it with a module-scope `spcStartWhenReady(null, spcRun)`
  kick plus a retrying `plugin-api:main` lookup. Discourse v2026.8 removed the `plugin-api:main`
  container registration, so that lookup returns `null` forever and the pattern **silently
  disables the whole initializer** — no console error, the retry loop just gives up. All four
  were converted to `export default apiInitializer(spcRun)`, the pattern the other ten always
  used. Never reintroduce a `plugin-api:main` lookup; `apiInitializer` / `withPluginApi` are the
  only supported entry points.
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

Three libs hold headings that are matched or reproduced literally, and none of them may be
edited casually:

| Lib | Holds | Why it is load-bearing |
| --- | --- | --- |
| `lib/spc-critique.js` | image critique headings and metadata keys | `lib/spc-parse-request.js` matches them **literally** to rebuild a request for the workspace modal |
| `lib/spc-project.js` | project critique headings, blockquote keys, dropdown values | the dropdown values land in the post; the blockquote is what the workspace half-parses |
| `lib/spc-introduction.js` | introduction headings and the image markdown | nothing parses it, but every existing introduction carries this exact shape |

All three live in JS rather than `locales/*.yml` **so a translator cannot silently break the
parser.** Only the *descriptions* of choices are translatable.

All three reproduce the Liquid `post_template` of the Custom Wizard they replaced, byte for byte.
**That property is now historical, not enforced** — the wizards are gone, so nothing can drift out
of step with them any more, and the reason to keep the strings is that existing posts carry them.
Changing a critique heading still means `spc-critique.js` **and** `spc-parse-request.js`.

**If a wizard ever has to be read again**, its `post_template` is at
`/admin/wizards/wizard/<id>.json`, signed in as admin — id is the slug with underscores.
`/w/<slug>.json` is the tempting URL and answers 200, but carries only steps and fields; the
`actions[]` array, and with it `post_template`, `category` and `tags`, exists **only** on the
admin path. Signed out, `/w/<slug>.json` also answers 200, with `permitted: false` and
`steps: []`, so an unauthenticated check looks like an empty wizard rather than a permission
error. The scratchpad harnesses that proved each template (six, six and twelve cases) are the
model for the next one of these.

## Rollback

**No form has a setting-level rollback.** All three Custom Wizards were replaced and deleted on
2026-07-26, and every setting that pointed at one went in the same change — nine of them:
`critique_image_use_form`, `critique_image_wizard_url`, `critique_project_use_form`,
`critique_project_wizard_url`, `critique_intro_wizard_url`,
`onboarding_first_photo_url_{de,en,fr}` and `onboarding_introduce_url_{de,en,fr}`. A switch whose
off position points at a deleted wizard is worse than no switch, because it looks like a way out
and lands on a 404. **Rolling any of the three forms back is a `git revert` plus an Update.**

The general rule, worth keeping even though the wizards are gone: **delete the settings that fall
back to a thing in the same change as the thing**, and grep for its URL first — the rollback
switch is rarely the only thing pointing at one. Each image wizard also had an onboarding panel
step, three locale-suffixed settings deep, which nothing else would have caught.

**The Custom Wizard plugin can now be uninstalled.** Nothing in this theme references it. It is
the source of the `discourse.html-safe-helper`, `native-array-extensions`, `template-action` and
`select-kit-resolved-components` admin notices, none of which come from this theme — expect all
four to disappear with it. That is a server-side change: remove its clone line from
`containers/app.yml` and rebuild — worth bundling with the next planned rebuild, since every
rebuild costs a few minutes of downtime.

The seven disabled components (3, 12, 19, 20, 23, 36, 37) are the rollback path for the
merged-in features; their settings are intact in the database. Do not delete them yet.
