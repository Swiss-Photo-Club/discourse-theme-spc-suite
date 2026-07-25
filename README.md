# SPC Suite — Discourse theme component

Customisations for [community.swissphotoclub.com](https://community.swissphotoclub.com): the
homepage layout, the Monthly Challenge category (hero, brief, voting, archive) and the
full-page photo submission form at `/submit`.

This is a single theme **component**, meant to be attached to the Foundation and Horizon
themes. It replaces three earlier components (SPC Monthly Challenge, SPC Homepage Design,
SPC Photo Challenge Submit), which were merged so that one install covers everything and
the shared SCSS lives in one place.

## Installing and updating

Install it from this repository rather than from a zip:

1. In Discourse, go to **Admin → Customize → Components → Install → From a git repository**.
2. Paste this repository's HTTPS clone URL.
3. Attach the component to **Foundation** and **Horizon**.

Installing from git means Discourse offers an **Update** button whenever this repository
gets new commits, so changes ship by pushing to `main` and clicking Update. Editing the
component in the admin UI still works but gets overwritten on the next update — treat this
repository as the source of truth.

Note that a fresh install starts from the defaults in `settings.yml`. If you ever delete
and reinstall rather than update, check the settings page afterwards.

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

## What's in here

| Path | Purpose |
| --- | --- |
| `about.json` | Component manifest. Must stay at the repository root for Discourse. |
| `settings.yml` | The 14 admin settings, including the `challenges` objects setting. |
| `common/common.scss` | All styling: homepage, challenge category, submit page. |
| `locales/{en,de,fr}.yml` | Interface strings in all three site languages. |
| `javascripts/discourse/api-initializers/spc-homepage.js` | Homepage category cards, webinar card, prompt badge on the pinned brief. |
| `javascripts/discourse/api-initializers/spc-monthly-challenge.js` | Category hero, official brief block, archive, voting dialog. |
| `javascripts/discourse/api-initializers/spc-challenge-vote-mover.js` | Repositions the Topic Voting button on challenge topics. |
| `javascripts/discourse/api-initializers/spc-photo-submit.js` | Routes submit buttons and `/new-topic` in the challenge category to `/submit`. |
| `javascripts/discourse/spc-submit-route-map.js` | Registers the real `/submit` route. |
| `javascripts/discourse/{routes,controllers,templates}/spc-submit.*` | The `/submit` page. |
| `javascripts/discourse/components/spc-submit-form.gjs` | The form: title, image uploader with preview, description, round tag. |
| `javascripts/discourse/components/spc-submit-banner.gjs` | Optional submit banner (off by default). |
| `javascripts/discourse/lib/spc-submit-helpers.js` | Tag resolution and shared helpers. |

## Notes for whoever edits this next

**`/submit` is a real route, not an overlay.** Discourse's `mapRoutes()` picks up any
requirejs module whose name ends in `route-map`, including theme modules, which is how a
component can own a URL. Because the server 404s unknown top-level paths, direct loads and
refreshes rely on an admin **permalink** `submit` → `/new-topic?category=monthly-challenge`
plus a `route:new-topic` override that redirects back to `/submit`. If `/submit` ever stops
working on a hard refresh, check that the permalink still exists.

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

**Tag lookups**: `/tags/filter/search.json?q=YYYY-MM&categoryId=6` — do not pass a `limit`
parameter, it returns a 400.

**Category 6 hides the member-facing topic footer buttons**, but a block at the end of
`common.scss` deliberately re-shows the topic admin wrench so staff can pin the brief.
Don't collapse those rules together.
