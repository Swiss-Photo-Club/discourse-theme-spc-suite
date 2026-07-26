# Handoff — 2026-07-26

Working state for a fresh conversation. Delete this file once picked up; it is
transient, unlike CLAUDE.md.

## Read first, in this order

1. **`CLAUDE.md`** — updated substantially this session. The masonry section in
   particular is new and was expensive to learn.
2. **`docs/spc-category-hero-design-spec.md`** — read the status note at the
   top, then §6a, then the body. The body is superseded in several places and
   the status note lists where.
3. **`docs/spcconsolidationplan.md`** — status note at the top. Steps 1–5, 7, 8
   are done; step 6 was dropped deliberately.

## Where things stand

`main` is at `456d1d8`, working tree clean, **nothing unpushed**. Everything
below is deployed and verified on the live site, signed in and signed out.

**Step 8 — category heroes. Complete.** Categories 6, 7, 8, 10 and 12 all render
`.spc-hero` through `lib/spc-hero.js`. Category 6 shares the renderer but is
deliberately *not* in `hero_enabled_categories` and *not* gated by
`enable_category_hero` — its hero sits on the `/submit` permalink stack.
Commits `96c2074` → `14976a6`.

**Step 9.1 — category 6 converted from a CSS grid to real masonry.** All four
thumbnail categories (6, 7, 8, 12) are now genuinely JS-positioned masonry; 10
is list mode. This took five attempts and one revert. Commits `5af4e12` →
`48e5127`, written up in `1bfe742`.

**Follow-ups after that.** `83bf7c7` gave the vote control room in its footer,
`77cc0c4` removed the vote button from the brief's card, `5b44ed9` and
`456d1d8` fixed what signed-out visitors see.

## What is next

### The form engine port (the task in progress)

Three critique flows exist and only one runs on the theme's own engine:

| Flow | Engine | Entry point |
| --- | --- | --- |
| Submit an image | **theme** | `/submit/critique` |
| Submit a project | Custom Wizard | `/w/projekt-zur-kritik-einreichen` |
| Introduce yourself | Custom Wizard | `/w/vorstellung-einreichen` |

The user wants the other two ported so all three look and behave alike. The
reference design is https://community.naturephotographers.network — they use
the same Discourse components with no special tricks.

**Scoping already done, so the next conversation does not repeat it:**

- The existing engine is small and is the template to copy:
  `spc-submit-route-map.js` (10 lines), `routes/spc-submit-critique.js` (8),
  `templates/spc-submit-critique.gjs` (5), `controllers/spc-submit.js` (6),
  `components/spc-submit-form.gjs` (556), `lib/spc-critique.js` (161),
  `lib/spc-parse-request.js` (90), `lib/spc-submit-helpers.js` (44).
- **Wizard definitions are readable at `/w/<slug>.json` while signed in as
  admin — status 200.** The admin API paths (`/admin/wizards/wizard.json` and
  friends) all 404 on this install. This is the one thing that was awkward to
  find; start there to get each wizard's fields and its `post_template`.
- Slugs: `projekt-zur-kritik-einreichen`, `vorstellung-einreichen`, each with
  `-en` and `-fr` siblings. The suffix is appended by `localeSuffix()`.
- **The load-bearing constraint.** `lib/spc-critique.js` holds every critique
  heading. `lib/spc-parse-request.js` matches them *literally* to rebuild a
  request for the Critique Workspace modal, and they reproduce the wizard's
  Liquid `post_template` byte-for-byte so wizard-made and form-made posts stay
  interchangeable. A new form must reproduce its wizard's template exactly, or
  the workspace silently stops recognising older posts. There is no error when
  this breaks.
- Each new route needs **its own permalink row** in the admin — Discourse
  matches the full path including the query string.
- Deleting a wizard is not part of this. The plugin also serves the four
  `onboarding_*_url_*` step URLs.

Nothing has been written yet. Propose a decomposition first.

### Also open

- **9.2 — extend the card treatment** (white card, shadow, hover, typography)
  from category 6 to categories 7 and 12, so the three photography categories
  match. This was the user's original request; 9.1 was the prerequisite.
  Categories 7 and 12 have masonry but no card chrome.
- **The brief appears twice** on category 6 — as the full brief section and as
  a card in the grid. It always has. Hiding the row is impossible under masonry
  (see CLAUDE.md); the vote button has been removed so it no longer reads as an
  entry, but giving it a distinct card treatment is still open.
- **Pinned cards now show a thumbnail** rather than reading as a plain indigo
  banner. That is forced by masonry. If the banner look matters, the route is a
  deliberately short thumbnail, never a collapsed one.
- **German copy** in `locales/de.yml` under `hero.*` is mine and unreviewed. The
  user's colleagues were going to check it.

## Working agreement

Also saved to memory as `spc-suite-working-agreement`.

1. One commit and one Update per step, never batched. **Stop after each and
   wait** for the user to push, Update and confirm.
2. Propose the decomposition before writing code.
3. Prove SCSS with the harness in CLAUDE.md — compile before and after, expand
   component tokens to literal hex, diff **rule identity**, not bytes. Show the
   diff. A rebuildable harness lives in the session scratchpad
   (`gen-stub.mjs`, `normalize.mjs`, `snap.sh`); `npx sass` works.
4. A CSS proof says nothing about JS. Anything that renames or matches a class
   is verified by **clicking**.
5. After each step, say exactly which surfaces to check and what would count as
   wrong — including any manual settings change, since an Update preserves
   every setting whose name is unchanged.
6. If a step needs a decision the docs do not settle, stop and ask.

## Diagnostic lessons from this session

The technical traps are in CLAUDE.md. These are about method, and all three
cost real time here.

- **Measure offsets, not just sizes.** The masonry bug survived four rounds
  because every size check passed while the image sat at `top: -246px`. It was
  found by someone who compared the image's top against its container's top.
- **Simulate the whole chain against live data before committing.** Doing this
  caught `fancy_title_localized` being a boolean, which would have shipped a
  hero headline reading "true".
- **Verify signed-out.** Two separate defects were invisible while signed in —
  the members-only paywall path, and the masonry gaps the user kept screenshotting.
- **Weight the user's screenshot over your own measurement.** When they
  disagree, the measurement is answering a different question.

## Site facts worth not rediscovering

- Categories 6, 7 and 8 are **members-only**: `/t/<id>.json` answers **402**
  with a redirect to `/t/nur-fuer-mitglieder-.../20` for signed-out visitors.
  Categories 5 and 12 answer 200. Category *listings* are public everywhere,
  which is why the hero can fall back to listing data.
- Topic tags arrive as `{id, name, slug}` objects from category listings and as
  bare strings elsewhere. `tagName()` in `spc-monthly-challenge.js` normalises.
- The live theme stylesheet is ~117 KB compiled locally, ~75 KB as served.
  Health check is in CLAUDE.md.
