# SPC Suite — Discourse theme component

Everything custom on [community.swissphotoclub.com](https://community.swissphotoclub.com) in
one component: the homepage layout, the Monthly Challenge category, the full-page photo
submission form at `/submit`, the critique tooling, the leaderboard strip, the onboarding
and join banners, the site fonts, and the locale cookie shared with the main site.

This is a single theme **component**, meant to be attached to the Foundation and Horizon
themes. It replaces ten earlier components, merged so that one install covers everything,
the SCSS cascade lives in one place, and there is only one thing to update.

## Installing and updating

Install it from this repository rather than from a zip:

1. In Discourse, go to **Admin → Customize → Components → Install → From a git repository**.
2. Paste this repository's HTTPS clone URL.
3. Attach the component to **Foundation** and **Horizon**.

Installing from git means Discourse offers an **Update** button whenever this repository
gets new commits, so changes ship by pushing to `main` and clicking Update. Editing the
component in the admin UI still works but gets overwritten on the next update — treat this
repository as the source of truth.

Note that a fresh install starts from the defaults in `settings.yml`. If you ever delete and
reinstall rather than update, check the settings page afterwards. Setting *values* live in
the Discourse database, not in git; an Update preserves the value of any setting whose name
is unchanged, and resets renamed ones to their new default. Every default in `settings.yml`
is the value that was live in production when the seven components were merged in, so a
fresh install reproduces the site as it stood at merge time.

## Feature map

Each feature is self-contained: one SCSS partial, its own JS entry point, its own locale
namespace, and its own setting prefix. To find everything belonging to a feature, grep for
its prefix.

| Feature | Toggle | SCSS | JS | Locale namespace | Setting prefix |
| --- | --- | --- | --- | --- | --- |
| Branding (fonts, colours) | — | `scss/branding.scss` | — | — | — |
| Homepage design | `enable_local_featured_categories` (migration only) | `scss/homepage.scss` | `api-initializers/spc-featured-categories.js`, `components/spc-featured-categories.gjs`, `api-initializers/spc-homepage.js` | `homepage.*` | — |
| Monthly challenge | — | `scss/challenge.scss`, `scss/challenge-staff.scss` | `api-initializers/spc-monthly-challenge.js`, `spc-challenge-vote-mover.js` | `monthly_challenge.*` | `challenge_*`, `monthly_*`, `challenges` |
| `/submit` photo form | — | `scss/submit.scss` | `spc-submit-route-map.js`, `{routes,controllers,templates}/spc-submit.*`, `components/spc-submit-form.gjs`, `components/spc-submit-banner.gjs`, `lib/spc-submit-helpers.js`, `lib/spc-critique.js`, `api-initializers/spc-photo-submit.js` | `form.*`, `critique_form.*`, `banner.*` | `round_tag*`, `show_banner`, `replace_new_topic_button` |
| Critique Workspace | `enable_critique_workspace` | `scss/critique-workspace.scss` | `initializers/spc-critique-workspace.js`, `components/spc-critique-workspace.gjs`, `lib/spc-parse-request.js` | `critique_workspace.*` | `workspace_*` |
| Critique Submit buttons | `enable_critique_submit` | `scss/critique-submit.scss` | `connectors/discovery-list-container-top/spc-critique-submit.gjs` | `critique_submit.*` | `critique_*` |
| Leaderboard strip | `enable_leaderboard` | `scss/leaderboard.scss` | `api-initializers/spc-leaderboard-strip.js` | — | `leaderboard_*` |
| Member onboarding panel | `enable_onboarding` | `scss/onboarding.scss` | `api-initializers/spc-member-onboarding.js`, `components/spc-member-onboarding.gjs` | `onboarding.*` | `onboarding_*` |
| Non-member join banner | `enable_nonmember_banner` | `scss/non-member-banner.scss` | `api-initializers/spc-non-member-banner.js`, `components/spc-non-member-banner.gjs` | `nonmember_banner.*` | `nonmember_*` |
| Locale cookie | `enable_locale_cookie` | — | `api-initializers/spc-locale-cookie.js` | — | — |

**Four features have no toggle, deliberately.** Branding is pure CSS with no JS entry point
to gate. The homepage, monthly challenge and `/submit` features are one interlinked stack —
the route map, the `submit` permalink and the `route:new-topic` override depend on each
other — so a half-enabled state would break `/submit` rather than degrade gracefully. If you
need one of them off, detach the whole component.

Other top-level files:

| Path | Purpose |
| --- | --- |
| `about.json` | Component manifest, including the five branding assets. Must stay at the repository root. |
| `settings.yml` | Admin settings, grouped by feature. |
| `common/common.scss` | Import list only. See below. |
| `locales/{en,de,fr}.yml` | Interface strings in all three site languages. |
| `assets/` | Open Sans (4 weights) and the branding image. These exist nowhere else — do not delete them. |

## The stylesheet is order-dependent

`common/common.scss` contains nothing but `@import` lines. Their order is load-bearing: it
reproduces the cascade the separate components used to produce, where Discourse emitted
their CSS in component-id order (3 Branding, 19 Critique Workspace, 20 Critique Submit,
23 Leaderboard, 36 Onboarding, 37 Non-Member Banner, 61 SPC Suite). Reordering the imports
changes which rule wins.

**The imports use bare names, not paths.** Discourse uploads the `scss/` folder as
`extra_scss` theme fields keyed by **basename**, so `scss/branding.scss` becomes the
importable name `branding`. Writing `@import "scss/branding"` fails the whole stylesheet
with *"Can't find stylesheet to import"* and the component then ships ~300 bytes of CSS
comment instead of 67KB of rules — i.e. the entire site loses its styling, silently, with no
admin-UI error. If the site ever goes unstyled after an update, fetch
`common_theme_61_*.css` and look at the first line.

`scss/challenge-staff.scss` must stay **last**. The challenge rules blanket-hide the topic
footer's `__actions`; that final block re-shows only the wrench so staff can pin the brief,
and it works purely by being later in the cascade.

## The monthly challenge workflow

The **pinned topic in the Monthly Challenge category is the current challenge.** Nothing is
inferred from post dates or authorship, so posting normally in the category is safe.

To open a new round:

1. Create a tag named `YYYY-MM-theme` (for example `2026-08-portraits`) and add it to the
   **Challenge Round** tag group. The category requires at least one tag, and the submit
   form resolves the round by matching the current `YYYY-MM` prefix.
2. Post the brief as a normal topic in **Monthly Challenge**, tagged with that tag, with a
   photo attached — the homepage card uses the topic's own thumbnail.
3. Pin it: topic footer → the wrench (topic admin menu) → **Pin Topic**. Discourse requires
   a *Pin until* date; set it to the voting deadline.

The homepage then decorates that topic with a "This month's prompt" badge, and the category
hero and `/submit` form pick up the round tag on their own.

The `challenges` setting is an **archive and override**, not the source of truth for which
round is current. Use it to record past rounds, deadline text for the hero, and winners.

## Homepage category workflow

**Admin → Configure → Navigation → Default navigation menu categories** is the single source
of truth for the highlighted homepage cards and their order. It is a core Discourse setting,
so the same selection also seeds the sidebar for anonymous visitors and new accounts.
Existing members can still customize their own sidebar; that personal choice does not change
the site-wide homepage highlights.

The `homepage_secondary_categories` SPC Suite setting controls the compact category cards
shown underneath. If a category is in both settings, it appears once in the highlighted
group. The renderer does not inject, substitute, or reorder either admin-controlled list.
The Monthly Live Webinars card remains independent because it links to an events page rather
than a category.

`enable_local_featured_categories` is a temporary cutover switch. Keep it off while the
external Featured Categories component is attached; detach that component and enable this
switch in the same maintenance pass. After the local renderer has remained stable, remove
the switch and its legacy fallback.

## Rolling back

The seven components this replaced were **detached, not deleted**. If something is missing
after the switchover:

1. Detach **SPC Suite** from Foundation and Horizon.
2. Re-attach the old components (SPC Branding CSS & Assets, SPC Community Locale, SPC
   Critique Workspace, SPC Critique Submit, SPC Leaderboard Strip, SPC Member Onboarding
   Progress, SPC Non-Member Homepage Banner) plus the pre-merge SPC Suite.

Their settings values are untouched in the database, so they come back configured. Once the
merged component has run cleanly for a while, the old ones can be deleted — but not before.

## Notes for whoever edits this next

**`/submit` is a real route, not an overlay.** Discourse's `mapRoutes()` picks up any
requirejs module whose name ends in `route-map`, including theme modules, which is how a
component can own a URL. Because the server 404s unknown top-level paths, direct loads and
refreshes rely on admin **permalinks** plus a `route:new-topic` override that decodes the
category and redirects back to `/submit`. If `/submit` ever stops working on a hard refresh,
check that the permalinks still exist.

**Permalinks match the query string too, so each mode needs its own.** Discourse compares a
permalink against the full request path *including* `?…` — that is what the
`permalink_normalizations` site setting exists to trim. So `submit` matches `/submit` and
nothing else, and `/submit?type=critique` 404s on a hard refresh without a second permalink.
Both are required:

| Permalink URL | Target |
| --- | --- |
| `submit` | `/new-topic?category=monthly-challenge` |
| `submit?type=critique` | `/new-topic?category=critique-portfolio-reviews` |

The mode is carried by the *category*, not by an extra query param, so `route:new-topic`
decodes it with the same helper for both. A side effect worth knowing: any link to the
composer for the critique category now lands on the critique form. That is intended — the
New Topic button there is hidden by `critique_hide_new_topic_button` anyway — and it is
guarded by `critique_image_use_form`, so the rollback switch restores the plain composer.

**The masonry grid is fragile.** The Topic List Thumbnails component measures every topic
row and positions it absolutely. Any DOM change that alters a row's height desynchronises
the layout and makes photos overlap text. On topic rows, only ever add
absolutely-positioned decoration — this is why the prompt badge is a positioned span inside
the thumbnail rather than an injected header cell.

**The initializers use an unusual boot shape.** Discourse's theme api-initializer wrapper
is invoked with an undefined argument on this site and logs a `__container__` TypeError.
That error is harmless: each initializer also kicks itself off at module scope and retries
the `plugin-api:main` lookup, so the work happens regardless. Don't "fix" it by removing
the top-level call.

**Renaming a setting has three edit sites, not one.** Discourse exposes settings to SCSS as
`$setting_name` as well as to JS as `settings.setting_name`, so a rename has to touch
`settings.yml`, the JS, *and* the SCSS. `scss/critique-submit.scss` is the one partial that
interpolates settings (`body.category-#{$critique_category_slug}`, `@if
$critique_hide_new_topic_button`).

**`resolve_group_membership: true`** on `onboarding_member_groups` and
`nonmember_member_groups` makes Discourse expose derived booleans
`settings.user_in_onboarding_member_groups` and `settings.user_in_nonmember_member_groups`.
Both components check `Object.hasOwn` first and fall back to comparing
`currentUser.groups` by hand, so they still work if the derived key is missing — but the
derived key name follows the setting name, so a rename breaks the fast path silently.

**Tag lookups**: `/tags/filter/search.json?q=YYYY-MM&categoryId=6` — do not pass a `limit`
parameter, it returns a 400.

## `/submit` has two modes

The route takes a `type` query param, read by `controllers/spc-submit.js` and passed
straight through to `SpcSubmitForm`:

| URL | Mode | Posts to |
| --- | --- | --- |
| `/submit` | Monthly challenge entry | Monthly Challenge, tagged with the resolved round tag |
| `/submit?type=critique` | Single image for critique | the critique category, tagged with the chosen subject |

Critique mode replaces the Custom Wizard `bild-zur-kritik-einreichen`. The **project** and
**introduction** wizards are untouched and still live — only the single-image flow moved.

**Critique posts must stay byte-compatible with the wizard.** The Critique Workspace modal
does not read structured data; `lib/spc-parse-request.js` parses the post *markdown*, looking
for `**Kritik-Stil:**`, `## Über dieses Bild`, `## Wo ich mir Feedback wünsche` and
`## Technische Details` in all three languages. `lib/spc-critique.js` reproduces the wizard's
Liquid `post_template` exactly, including the French space before the colon (`Style de
critique :`) and the omission of empty optional sections. Those strings deliberately live in
JS rather than in `locales/*.yml`, so that translating the UI cannot silently break the
parser — only the dropdown *descriptions* are translatable. If you change a heading, change
it in `spc-critique.js`, in `spc-parse-request.js`, **and** in the three wizard definitions.

**The subject dropdown is fetched, not hard-coded.** The critique category requires at least
one tag from the **Critique Subjects** tag group and `/posts.json` enforces that server-side,
so the form asks `/tags/filter/search.json?categoryId=…&filterForInput=true` which tags
Discourse will accept and offers only those. Note that the wizard's own dropdown offers
`architecture`, `travel` and `abstract`, which are **not** in the tag group — the wizard
creates topics through its own action and bypasses the validation, which is why topics tagged
`architecture` exist in a category that should not allow them. Add those three tags to the
Critique Subjects group if you want them offered; `critique_form.subjects.*` already has
translations waiting for them.

**Rollback is a setting, not a revert.** `critique_image_use_form` off sends the "Submit an
image" button back to `critique_image_wizard_url`. That takes effect immediately, without
pushing a commit and clicking Update.
