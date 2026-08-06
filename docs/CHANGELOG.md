# Change history

Why things are the way they are. Current-state documentation lives in `README.md` and in the
Claude project docs; this file is the archive, kept so nobody re-litigates a decision or
re-introduces a fixed bug. Newest first.

## Unreleased — Standardise category pages and specialise the challenge content

Every category now uses one ordered surface: photo-backed hero and actions, native category
description with a link to its admin-maintained About topic, optional category sections and the
shared leaderboard, then Discourse's native list controls immediately before the posts. The category
background continues to come from `uploaded_background`; no parallel text or URL registry was
added. Photo Feedback has no post-count status line.

Signed-in members keep a generic **Start a topic** action while Discourse's per-category
permission value is still loading, preventing the banner action from disappearing during the
initial render.

Native New Topic is now also retained in the list-controls bar on every category page; the
homepage remains the only surface that suppresses it. Photo Feedback, Introductions and Monthly
Challenge route that native control into their existing SPC submission forms. Category
leaderboards now keep 24px of space below them before the list controls, matching the category
mockup.

Category pages now use the homepage's light-grey canvas and the same raised white controls bar.
The active navigation tab has one coral underline—the duplicate navy core indicator is removed.
Native creation controls are relabelled for their destination in German, English and French:
photo submission, new introduction, meetup proposal, post-processing question or generic topic.
The leaderboard is no longer category-selected; while enabled, it renders on every category.

Monthly Challenge now names the category in the hero and places the current theme plus its
end-of-month deadline beneath it. A compact current-round card links to the pinned brief, and
the most recent archived round gets a dedicated, uncropped winner section once its winner data
is complete. Its banner uses the same heading scale, padding and minimum height as every other
category; only the additional theme and deadline content differs.
The former full cooked brief and post-list archive have been retired.

The challenge category no longer widens `#main-outlet-wrapper` to 1500px, hides native filters,
or adds its own horizontal list padding. It uses the same Discourse 1110px wrapper as every
other category. Leaderboard strips on category pages moved above the list controls so nothing
custom separates those controls from `#list-area`.

## Unreleased — Add the member identity banner and restore native homepage width

The homepage now owns a photo-backed member identity banner and an introductory text band.
The photo is an upload theme setting, the three translations remain editable in Discourse,
and the longer community copy stays in a linked topic rather than being duplicated in the
theme. The existing non-member invitation reuses the uploaded photo and replaces only the
member identity banner, leaving the introduction beneath it; onboarding keeps the slot
immediately above both banners.

Featured Categories, onboarding and list controls no longer subtract another 64px from the
main column or impose a 1120px cap. Discourse already provides a 1110px wrapper and responsive
side padding, so the extra container made these sections 64px narrower than both the banner
and topic list. The homepage New Topic control is hidden while category-page actions remain
untouched.

The Photo Feedback category currently uses `/c/photo-feedback/7`, so homepage enhancement now
resolves its stable category id first and treats the slug as a fallback. This restores the two
large primary cards without making their presentation depend on the current slug.

## Unreleased — Make SPC Suite own every category header

Category Banners remained enabled only because the shared hero used its hidden
`.category-title-header` element as an insertion anchor. The Monthly Challenge brief used the
same element for placement. That made a visually obsolete component an undocumented runtime
dependency, and because it was attached only to Foundation, Horizon did not have the same
category-page contract.

SPC Suite now renders a stable `above-main-container` surface of its own. The hero and challenge
brief render into that surface, whose `display: contents` wrapper preserves their previous
direct-child layout. Every category receives the shared hero automatically, so neither Category
Banners' three-category setting nor SPC Suite's separate `hero_enabled_categories` list remains
part of the behavior. Categories with no explicit override use their own name, description and
background plus a permission-aware “Start a topic” action.

The external Category Banners component can be detached after this version is installed. It is
safe to leave it attached during the update because SPC Suite continues hiding its output.

## Unreleased — Make Discourse navigation defaults own homepage categories

The homepage category renderer now reads core's
`default_navigation_menu_categories` client setting instead of maintaining the highlighted
category list in an external theme component. This makes the admin navigation selection the
single source of truth for both new-visitor sidebar defaults and homepage highlights.

SPC Suite preserves the Featured Categories DOM contract so the existing homepage styling
and enhancements continue to work. Compact cards remain configurable through
`homepage_secondary_categories`; duplicates are removed in favour of the highlighted
selection. No category-specific feature may insert, replace, or reorder an entry. A
temporary `enable_local_featured_categories` switch keeps the old component available during
cutover and will be removed after the local renderer has been stable in production.

## 7215dd1 — Stop the leaderboard and challenge renderers from storming the rate limiter

**Symptom.** A bare "429 error" dialog on reloading `/c/critique-portfolio-reviews/7`, and
later a full-page Ember error screen on `/c/meetups-photowalks/8` reading "while trying to
load `/c/monthly-challenge/6/l/latest.json?filter=default`". The user's console held 769
errors.

Two red herrings worth naming. First, the dialog is empty because Discourse's rate limiter
returns a **plain-text** body (`"Slow down, too many requests…"`) with HTTP 429, and the ajax
error handler `JSON.parse`s it — so the console shows `SyntaxError: Unexpected token 'S',
"Slow down,"… is not valid JSON`, which reads like a parsing bug and is not. Second, the
Meetups error names a challenge URL, which looks like our code failing on an unrelated page;
`?filter=default` is actually the signature of a **core** TopicList request. Our theme never
adds that param. Core was being refused because we had tripped the limiter.

**One root cause, five mechanisms.** Both `spc-leaderboard-strip.js` and
`spc-monthly-challenge.js` drove renders from a `MutationObserver` on `document.body`
debounced only by `requestAnimationFrame` — up to 60 renders/second, each mutating the DOM
and thereby re-triggering the observer. On top of that loop:

1. the leaderboard cached its data **after** the `await`, so every render that began while a
   request was in flight saw an empty cache and fired its own `/leaderboard/<id>.json`;
2. the challenge renderer did `topicCache.delete(cacheKey)` in its failure handler, re-arming
   the fetch on the very next frame — a rate-limited response therefore produced a burst of
   retries that kept the limiter tripped;
3. `render()` awaited the pinned brief and the challenge topic **before** checking whether the
   page shows challenge content, so simply reading Meetups or Announcements fetched two
   challenge endpoints for nothing;
4. `api.onPageChange` cleared both caches on every navigation.

Measured on one Meetups page load, a page that displays none of this data:
`/leaderboard/1.json` x4, `/c/6/l/latest.json` x4, `/t/37.json` x3, plus core's own
`?filter=default` request x2.

**Fix.** Promise-caching instead of value-caching; a 60s cool-off before a failed fetch may be
retried; leading-edge `setTimeout(200)` throttling in place of rAF in both files; a
`needsChallengeData()` gate that runs before any await; and a 5-minute cache TTL replacing the
per-navigation clear. `spc-homepage.js` and `spc-challenge-vote-mover.js` use the same
observer pattern but make no network calls, so they were deliberately left untouched.

**Regression baselines.** A Meetups or Announcements page must make **zero** challenge
requests. The critique page must request `/leaderboard/1.json` exactly **once**.

## 185808a — Give the challenge hero its own element instead of overwriting the category header

Symptom: the category page looked right on first paint, flashed a broken layout during
reload, and looked "totally broken" on the critique category. Cause: the hero was rendered
*into* the category header element, which core owns and re-renders on navigation, so the two
fought. Fix: the hero gets its own element that the theme creates and removes. General rule
that came out of it — never decorate a DOM node core owns.

## 21285f2 — Rename the critique select block params so `<option>` stays an element

Symptom: the critique form rendered itself twice, with `manager` errors in the console. The
first theory — a query-string/routing artefact — was **wrong**. Real cause: in a `.gjs`
strict-mode template a block param named `option` shadows the `<option>` HTML element, so
each `<option>` was resolved as a component invocation. Renaming the block params fixed it.
Lowercase element names at risk: `option`, `input`, `label`, `output`, `select`, `form`,
`data`, `time`, `slot`.

## ee2c432 — Give the critique form its own path (`/submit/critique`)

`?type=critique` worked when clicked but 404'd on a hard refresh, because Discourse matches
permalinks against the **full** request path including the query string, so the `submit`
permalink matched `/submit` and nothing else. That was first patched by adding a
`submit?type=critique` permalink row (see `3c1d107` below); this commit moved critique to a
real path instead, which sidesteps the trap entirely. `?type=critique` still redirects, for
links shared before the change.

## 3c1d107 — Fix `submit?type=critique`

`api.modifyClass("route:new-topic")` generalised from `isChallengeCategoryParam` to
`isCategoryParam(params, id, slug)` so it decodes either category. **The code half alone did
not fix the 404** — the permalink row was the missing piece. Worth remembering: a theme-owned
route needs both the client-side interception *and* a permalink to boot the app.

## 993112e — Combine the critique submit form into the monthly challenge submit form

Moved the single-image critique flow off the Custom Wizard. Scope was deliberately limited to
that one flow; the project and introduction wizards are untouched and still live.

`javascripts/discourse/lib/spc-critique.js` holds every load-bearing string. They are
load-bearing in two directions: `lib/spc-parse-request.js` matches them literally to rebuild
a request for the Critique Workspace modal, and they reproduce the wizard's Liquid
`post_template` exactly so wizard-made and form-made posts stay interchangeable. They live in
JS rather than `locales/*.yml` **so a translator cannot silently break the parser**.

Verified twice before shipping. (1) Round trip: `buildCritiqueRaw()` output fed through
`parseRequest()` and `questionKeysFor()` for all three locales x {all sections, required
only} → 48/48 assertions pass. (2) Byte-compatibility: a minimal Liquid renderer ran the
three real `post_template`s and diffed them against the form's output over 6 cases → all 6
byte-identical, including the French pre-colon space (`Style de critique :`).

Side fix: `locales/fr.yml` had no `form:` block at all, so French users saw English strings
on `/submit`.

## e98ce1c — Fix scss (site-wide breakage, ~10 minutes)

Immediately after the merge went live the whole site rendered unstyled. Cause:
`@import "scss/branding"` in `common/common.scss`. Discourse keys `extra_scss` theme fields by
**basename**, so the path form doesn't resolve, and the stylesheet compiled to a 303-byte
error comment — with no error surfaced anywhere in the admin UI. Fixed by dropping the `scss/`
prefix from all ten imports.

## 55fbddb — Combine all customizations into a single repo

Ten separate theme components became one. Three (38 Monthly Challenge, 39 Homepage Design, 48
Photo Challenge Submit) were merged and removed; seven more (3 Branding, 12 Locale, 19
Critique Workspace, 20 Critique Submit, 23 Leaderboard, 36 Onboarding, 37 Non-Member Banner)
were merged and left **disabled but present** as a rollback — their setting values are
untouched in the database, so re-enabling restores them fully configured.

The merge was a **pure move**: same code, only three classes of change — setting renames (to
give each feature a prefix), locale-key namespacing, and one `enable_*` guard per feature.
Every merged file was diffed against its admin export to prove nothing else changed.
Concatenating the four original SCSS partials was byte-identical to the old 66,894-byte
`common.scss`. Every `settings.yml` default was set to the value live in production at merge
time, so that even renamed settings — which Discourse resets to their new default on update —
landed on the correct value. Repo went 19 → 44 files.

The SCSS import order in `common/common.scss` reproduces the cascade Discourse used to
produce by emitting component CSS in component-id order (3, 19, 20, 23, 36, 37, 61). That is
why the order is load-bearing and why `challenge-staff` must stay last.

## Earlier fixes (pre-repo, 2026-07-23/24)

- **Original submit failures:** form template #1 attached to category 6, plus a tag mismatch
  (`2026-07` vs the only allowed `2026-07-cityscapes`). The form template is now detached and
  must stay detached — `/submit` posts via `/posts.json`, and a form template on the category
  breaks that path.
- **Overlay → real route:** the first implementation was a JS overlay. Replaced with a real
  Ember route after the user's feedback: "I want a similar execution, not a javascript hack."
- **"Join the community" banner showed for admins:** `member_groups` held only group 40.
  `currentUser.groups` includes automatic groups, so 1 (Administratoren) and 2 (Moderatoren)
  had to be added → `40|1|2`.
- **Homepage masonry overlap:** the homepage was on Topic List Thumbnails *list* mode
  restyled into a fake masonry (`column-count` + fixed card heights). Fixed by switching
  `default_thumbnail_mode` to masonry and deleting the fake-masonry SCSS. The prompt tile was
  re-implemented masonry-safely as an absolutely-positioned badge, because any DOM change
  that alters a topic row's height desynchronises masonry's measured layout.
- **Could not pin the challenge brief:** our own SCSS hid
  `.topic-footer-main-buttons__actions` in category 6 in three places, which also hid the
  topic admin wrench. Fixed by `scss/challenge-staff.scss` re-showing only
  `.topic-admin-menu-trigger` — which works purely by being last in the cascade.

## Investigated and dismissed

- **Wizard pages hide the header and sidebar** (`/w/<slug>/steps/step_1`). This is the Custom
  Wizard plugin's intended full-page treatment, not ours. Its stylesheet carries
  `body.custom-wizard .sidebar-wrapper { display: none }` and a zero-width sidebar grid
  column, among 350 `body.custom-wizard` rules. Proven with `?safe_mode=no_custom` (all themes
  and components off, `themeSheets: 0`): both still hidden. SPC Suite injects nothing on
  wizard pages, and our only sidebar rule sets a background colour.
- **`[THEME NN 'SPC Suite'] TypeError: Cannot read properties of undefined (reading
  '__container__')`.** Discourse's own theme api-initializer wrapper calls
  `initialize(e){ r.call(n, e.__container__) }` with `e === undefined`. Harmless, not ours,
  and the reason every initializer uses the top-level-kick + retrying-lookup shape. Do not
  "fix" it by removing the top-level call. It sometimes cites theme 58 rather than 61.
