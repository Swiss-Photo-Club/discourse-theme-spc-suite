# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: paying Swiss Photo Club members**, using `community.swissphotoclub.com` as a
benefit of their membership. They come to submit a photo to the monthly challenge, ask for
and give critique, introduce themselves, and find other photographers to shoot with.

**Secondary: visitors who are not yet members.** Converting them is an explicit, designed-for
job of the community, not an accident — the non-member banner and the three localised
`nonmember_join_url_*` settings exist for exactly this.

**Third: club staff**, who open and close challenge rounds, pin the brief, and moderate. Their
workflow is deliberately low-ceremony (pin a topic; create a `YYYY-MM-theme` tag) and the theme
is built so nothing custom has to be touched to run a round.

Both device classes carry real weight: members read and post on phones, and critique — looking
hard at a photograph — happens on a large screen. Neither is the secondary case; a change is
not done until it has been judged on both.

**German is the primary language.** English and French are fully supported (`locales/{de,en,fr}.yml`,
per-language membership URLs) but German is what most members actually use.

## Product Purpose

Give Swiss Photo Club members a place where photographs get seen, critiqued and improved —
month after month, by name, among people who know each other.

Success is four things at once, and they are all live goals:

1. **Active participation** — challenge entries, critiques written, introductions posted. The
   feedback culture staying alive is the product.
2. **Member retention** — the community is a reason members renew.
3. **Converting visitors** into paying members on swissphotoclub.com.
4. **Less admin work** — the challenge, critique and onboarding workflows should run
   themselves so a small staff spends its time on photography, not on steering the software.

When two of these conflict, participation and retention are the ones that make the other two
possible; a conversion device that costs members participation is a bad trade.

## Positioning

A **club** community, not a public photo forum. Membership is real and paid, members are known
to each other, and the critique culture is reciprocal by rule — the critique form states it
outright: for every image you submit, give thoughtful feedback on two others. The monthly
challenge gives the club a shared, dated rhythm that an open forum has no way to reproduce.

## Operating Context

- The whole product is **one Discourse theme component, id 61, "SPC Suite"**, attached to the
  Foundation and Horizon themes on a **hosted** Discourse install.
- Ten previously separate components were merged into this one, which is why `about.json` and
  therefore everything else sits at the repository root.
- **Monthly challenge round:** staff create a `YYYY-MM-theme` tag in the Challenge Round tag
  group, post the brief as a normal topic with a photo, and pin it. The pinned topic *is* the
  current challenge — nothing is inferred from dates or authorship. Voting runs alongside
  submissions all month and stays open until staff apply the staff-only `winner` tag to the
  winning entry and pin the next brief; the winner showcase derives from that tag. The
  `challenges` setting is an archive and override, not the source of truth.
- **Homepage highlights** come from core's *Default navigation menu categories*, so the same
  admin choice seeds the anonymous sidebar. `homepage_secondary_categories` controls the
  compact cards below.
- **Photo submission** is a real route at `/submit`, with a critique mode at `/submit?type=critique`,
  plus project and introduction forms.
- Live categories: 6 Monthly Challenge, 7 Critique & Portfolio Reviews, 8 Meetups & Photowalks,
  10 Support (displayed "Post Processing"), 5 Announcements, 2 Feedback, 12 Vorstellungen,
  4 General, 1 Uncategorized. Category 10's slug and display name disagree — match on id.

## Capabilities and Constraints

- **No server access, no git on the host, admin panel only.** This repository is the source of
  truth; the ship loop is commit → push → Update in Admin → Components → verify on the live site.
  Anything edited in the admin CSS editor is overwritten on the next Update.
- **No CI and no test suite.** Verification is a local dart-sass compile, a `content-tag` /
  `@glimmer/syntax` / `@babel/parser` parse pass, and then looking at — and clicking — the live
  site.
- Everything the theme can do is bounded by what a Discourse **theme component** may do: SCSS,
  JS initializers, `.gjs` components, outlet connectors, route maps, settings and locales. No
  server-side code, no migrations, no plugin.
- The theme shares a page with other components. **Topic List Thumbnails** (masonry on
  categories 6, 7, 8, 12) measures every topic row and positions it absolutely, so any change to
  a row's height desynchronises the layout. Category 10 is list mode.
- Interface strings live in `locales/{de,en,fr}.yml` — except the critique, project and
  introduction post templates, which live in JS on purpose so a translator cannot break the
  parser that reads existing posts back.
- Every Font Awesome icon the theme uses must be declared in `about.json`'s `svg_icons`
  modifier, or it renders as nothing with no error.
- The full trap list — SCSS basename imports, the load-bearing import order, the
  `border-radius` reset, three-site setting renames, permalinks matching the query string — is
  in `CLAUDE.md` and is binding.

## Brand Commitments

- **Swiss Photo Club.** The **swissphotoclub.com design system is the authority** — its
  typography, palette, spacing and component vocabulary are inherited, not reinvented here.
- **But the community is not meant to look identical to the main site.** It is a dialect of the
  same system, allowed its own look and feel. The deliberate expression of that: the main site
  leads with **coral pink**; the community leads with the **dark indigo `--spc-indigo: #1a2744`**.
  Coral is not banished — it is what ties the two together — and both tokens are live today
  across the same six partials (indigo 32 uses, coral 46). Read the rule as *which colour carries
  the community's lead surfaces*, not as a ban on coral, and do not "correct" the community back
  towards the main site's balance.
- **Open Sans** in four weights (Light, Medium, SemiBold, ExtraBold), shipped in `assets/` and
  declared in `about.json`. Those files, plus `JWIM4133.jpg`, exist nowhere else outside the
  Discourse database.
- Two colour systems coexist **by design**: hardcoded `--spc-*` tokens in `branding`, `hero`,
  `challenge`, `homepage`, `onboarding`, `non-member-banner`; Discourse core palette tokens in
  `submit`, `leaderboard`, `critique-workspace`.
- **A dark colour scheme is in scope.** Anything new should survive one — which means core
  palette tokens, not hardcoded hex, in any new work. The three palette-token partials above
  are the only ones that would survive today.
- Voice, as it stands in the locales: plain, warm, second person, no hype. "Tell us a little
  about yourself." "It doesn't need to be your best work."

## Evidence on Hand

- Real, live production content: an active community with real members, real challenge rounds
  (`2026-07-cityscapes` at time of writing), real critique threads and introductions.
- `assets/JWIM4133.jpg` — the one branding photograph shipped with the component.
- Member photography is the community's own content and the strongest visual asset available;
  it belongs on any surface that needs imagery.
- **No testimonials, member counts, pricing, awards or press claims are on record here.** Do not
  invent any; membership pricing and marketing claims live on swissphotoclub.com and are not
  this repository's to state.

## Product Principles

1. **The photograph is the subject.** Every surface exists to get a photograph looked at
   properly; interface that competes with the image is failing its job.
2. **Reciprocity over volume.** The culture is give-to-get, and the product should keep saying
   so — one image per day, two critiques back.
3. **Staff should never have to touch code to run the club.** A round opens by pinning a topic;
   a category gets a hero without a registry entry. Keep new work on that side of the line.
4. **Members first, conversion second.** Visitor-facing devices earn their place without
   crowding the members who are already here.
5. **A hosted, no-CI install means every change must be provable before it ships** — compile,
   parse, and verify by clicking, not by looking.

## Accessibility & Inclusion

No product-specific standard has been set beyond doing the sensible thing. The trilingual
requirement is the concrete inclusion constraint: German, English and French, with German
primary, and no design that assumes a string's length.
