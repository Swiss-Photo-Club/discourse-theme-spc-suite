# SPC Suite — duplicate implementation consolidation

Execution plan for collapsing the parallel implementations found in the 2026-07-26 audit.
Companion: `spc-category-hero-design-spec.md` (the target pattern).
Repo: `Swiss-Photo-Club/discourse-theme-spc-suite`, branch `main`, component 61.

Status: **complete, 2026-07-26.** Steps 1-5 and 7-8 are on the live site and verified; step 6
was dropped, keeping the core-palette files on core tokens so a dark scheme stays possible. D10
is done: both banner recolours are deleted and their settings retained per R4. The category-hero
work that step 8 called for is described in `spc-category-hero-design-spec.md`, whose status note
records where execution overrode the spec.

---

## What is duplicated

### Two colour systems

| Partial | System | Tokens used |
| --- | --- | --- |
| `branding` | SPC | `--spc-coral`, `--spc-indigo`, `--spc-gray-*`, `--fg-*`, `--stroke-*` |
| `challenge` | SPC (via a private alias block) | `--spc-challenge-*` → `--spc-*` |
| `homepage` | SPC | `--spc-coral`, `--spc-indigo`, `--spc-casablanca`, `--spc-gray-*` |
| `onboarding` | SPC | `--spc-coral`, `--spc-coral-hover` |
| `non-member-banner` | SPC | `--spc-coral`, `--spc-indigo` |
| `critique-workspace` | **core** | `--tertiary`, `--primary-medium`, `--primary-very-low`, `--primary-low`, `--secondary` |
| `leaderboard` | **core** | `--primary`, `--tertiary`, `--primary-low`, `--primary-very-low`, `--primary-medium` |
| `submit` | **core** | `--tertiary-very-low`, `--tertiary-low`, `--tertiary-hover`, `--primary-high`, `--primary-low-mid`, `--d-input-border-radius` |
| `critique-submit` | settings-interpolated hex | `$critique_banner_background` (`#FFE8E8`), `$critique_intro_banner_background` (`#E8F0F0`) |

The split follows the old component boundaries exactly: the three core-token files are the ones
merged in from components 19, 20 and 23, written before the SPC design system existed in this
codebase.

### Duplicated primitives

| Primitive | Implementations |
| --- | --- |
| Hero shell | `.spc-challenge-hero`, `.spc-non-member-banner` |
| Coral uppercase button | `.spc-challenge-button` (54px, `.08em`), `.spc-non-member-banner__button` (46px, `.04em`), `.btn-primary` in `branding` (`.65em/1.4em`, `.04em`), `[data-wrap="primary-button"]` (`.75em/1.5em`, no tracking), onboarding's CTA (42px, `.05em`), homepage's CTA (40px, `.04em`) |
| Eyebrow / kicker | `.spc-challenge-hero__eyebrow` + `.spc-challenge-section-kicker` + `.spc-monthly-card__eyebrow` (`.12em`, one shared rule), homepage's override of `.spc-monthly-card__eyebrow` (`.08em`), `.spc-non-member-banner__eyebrow` (`.16em`), sidebar section header (`.13em`) |
| Callout block | `.spc-cw-banner` (border-left 4px `--tertiary`, `--primary-very-low`), `.spc-composer-challenge` (border-top 4px coral, `#f3f5f8`), challenge brief blockquote (border-left coral, `#fff4f2`) |
| Card surface | `.spc-challenge-archive-card` (overlay + hover reveal), homepage tiles, masonry `.topic-list-item` |

### Dead declarations

`branding.scss` opens with `* { border-radius: 0 !important }`. `!important` beats an
unqualified declaration regardless of source order or specificity, so **every `border-radius`
in `submit.scss`, `leaderboard.scss` and `critique-workspace.scss` is dead**:

- `submit.scss`: `10px` (×2), `6px`, `var(--d-input-border-radius, 4px)`, `0 8px 8px 0`
- `leaderboard.scss`: `6px` (×2), `50%` (avatar)
- `critique-workspace.scss`: `4px` (×4), `999px` (chip)

Two of these have a visible consequence rather than being merely redundant: leaderboard avatars
render square, and workspace chips render as rectangles. See decision D3.

`homepage.scss` uses `border-radius: var(--radius) !important` where `--radius: 0` — redundant
but harmless; it wins on specificity and produces the same result.

---

## Decisions

| # | Concern | Keep | Delete | Rationale |
| --- | --- | --- | --- | --- |
| D1 | Hero shell | `.spc-challenge-hero`, renamed `.spc-hero` | `.spc-non-member-banner` shell | Owned element inserted before a hidden `.category-title-header` — survives Ember re-render. Already carries cover image, scrim and a `--with-cover` variant hook. The non-member banner has no cover mechanism. |
| D2 | Button | `.spc-challenge-button`, renamed `.spc-button`, with `--lg` (54px) and `--md` (42px) sizes | the other five | Only implementation with a defined hover token (`--spc-coral-hover`) and a real secondary variant. Two sizes are genuinely needed: a 54px CTA does not fit a 154px homepage tile. |
| D3 | Eyebrow | the shared `.12em` rule in `challenge.scss`, renamed `.spc-eyebrow` | homepage's `.08em` override, non-member's `.16em` | It is already the base rule; the others are overrides of it. Sidebar header keeps `.13em` — it is chrome, not content, and lives in a different visual context. |
| D4 | Colour tokens | `--spc-*` | core-palette usage in `submit`, `leaderboard`, `critique-workspace` | One system. See risk R1 — this is a real trade, not a free win. |
| D5 | `--spc-challenge-*` | nothing | all seven aliases | Five are pure pass-throughs. `--spc-challenge-muted` and `--spc-challenge-rule` are near-misses needing one decision — see D6. |
| D6 | Neutral values | promote `#8a909e` and `#e2e4e9` into the ramp | `--spc-gray-400: #8e98a8`, `--spc-gray-200: #e9ebf8` | The challenge values are what renders on the busiest pages today and were settled deliberately in phase 5. `#e9ebf8` is conspicuously blue for a neutral. **Blocked on tracing every consumer of `--spc-gray-200` / `--stroke-1` first.** |
| D7 | Callout | border-left 4px coral on `--bg-alt` | `.spc-cw-banner`'s tertiary treatment, `.spc-composer-challenge`'s border-top | Border-left is already the majority pattern (2 of 3). |
| D8 | Dead radii | — | all `border-radius` in `submit`, `leaderboard`, `critique-workspace` | Provably unreachable. |
| D9 | Gradient | — | `linear-gradient(--tertiary-very-low, --secondary)` in `submit.scss` | Only non-hero gradient in the component. Replace with flat `--bg-alt`. |
| D10 | Category banner recolours | — | `$critique_banner_background` / `$critique_intro_banner_background` blocks | Superseded by the hero. See risk R4 before deleting the settings themselves. |

---

## Commit sequence

Each step is one commit, one push, one Update in Admin → Components, one verification. Do not
batch — a broken `@import` produces a ~300-byte stylesheet with no error anywhere in the admin
UI, and batching makes the bisect expensive.

**Step 0 — baseline.** Record the healthy stylesheet size and first line before touching
anything:

```js
fetch([...document.querySelectorAll('link[rel=stylesheet]')]
  .map(l=>l.href).find(h=>h.includes('common_theme_61_')))
  .then(r=>r.text()).then(t=>console.log(t.length, t.slice(0,120)))
```

Healthy is ~75KB starting with `@font-face`. Re-run after every step. Also capture screenshots
of: homepage logged-out, category 6, category 7, category 12, a challenge entry topic, the
critique workspace modal, and the onboarding panel (needs a member session — the admin account
is not in group 40).

**Step 1 — delete dead radii (D8) and the submit gradient (D9).** Pure deletion, zero visual
change *except* leaderboard avatars and workspace chips, which are already square today and stay
square. If round avatars are wanted, that is a separate commit adding an exception to the global
reset — do not smuggle it in here.

**Step 2 — retire `--spc-challenge-*` (D5).** Mechanical find-and-replace of the five
pass-throughs. Leave `--spc-challenge-muted` and `--spc-challenge-rule` in place for now,
pointing at their literal values. Verify no visual delta at all.

**Step 3 — resolve the neutrals (D6).** Only after tracing consumers. This is the one step with
a deliberate site-wide visual delta, so it gets its own commit and its own before/after pass.

**Step 4 — extract `scss/hero.scss` (D1, D2, D3).** New partial imported immediately after
`branding`. Move the shell, button and eyebrow rules out of `challenge.scss` into it; leave
challenge-specific deltas behind. `challenge.scss` still imports later so its overrides win.
`challenge-staff.scss` stays last. Verify category 6 pixel-for-pixel before touching any other
category — if the reference surface changes, stop.

**Step 5 — fold in the non-member banner.** `.spc-non-member-banner` becomes
`.spc-hero.spc-hero--invitation`; only its deltas remain in `non-member-banner.scss`. Behaviour,
settings and group-gating untouched. Needs a logged-out session to verify.

**Step 6 — port the three core-token files (D4).** `leaderboard`, `critique-workspace`,
`submit`, one commit each. Mechanical token substitution; no structural change.

**Step 7 — unify callouts (D7).** Three call sites.

**Step 8 — heroes for categories 7, 8, 10, 12 (and 11).** Only now, once the primitives are
single-sourced. This is the step that needs the new `category_heroes` setting and the
`enable_category_hero` toggle from the hero spec. Delete the `critique-submit` banner recolours
here (D10), not earlier.

Steps 1–7 are refactoring with no intended visual change except D6. Step 8 is the first that
changes what a member sees on a category page. That boundary is deliberate: if something breaks
in 1–7, the cause is a token or an import, not a design decision.

---

## Risks

- **R1 — losing palette adaptation.** Core tokens derive from the admin "SPC color palette" and
  would follow a dark scheme automatically; `--spc-*` is hardcoded hex. D4 forecloses dark mode
  without a token-layer rewrite. `branding.scss` already hardcodes, so the site is largely
  committed to this already — but the three core-token files are currently the *only* part that
  would survive a palette change, and D4 removes that. Whether a dark scheme exists on this
  install is **[Unverified]**.
- **R2 — import order.** `hero` must land after `branding` and before `critique-workspace`, and
  `challenge-staff` must stay last. Imports are by basename, never by path — `@import "hero"`,
  not `@import "scss/hero"`. The path form fails silently and takes the whole site's styling with
  it.
- **R3 — setting renames have three edit sites.** `critique-submit.scss` is the one partial that
  interpolates settings. If D10 deletes those blocks, the SCSS edit site disappears and future
  renames of `critique_banner_background` become two-site. Do not rename in the same commit as
  the deletion.
- **R4 — rollback surface.** The seven disabled components (3, 12, 19, 20, 23, 36, 37) are the
  current rollback path and their settings are intact in the database. Do not delete them until
  this consolidation has baked. Deleting the `critique_banner_background` *settings* (as opposed
  to the SCSS that reads them) removes the ability to restore the pink/teal banners without a
  commit — keep the settings for one release even after the rules go.
- **R5 — masonry.** None of steps 1–7 touch topic-row height, so masonry is safe. Step 8 might,
  if any category's canvas width changes. Topic List Thumbnails measures every
  `tr.topic-list-item` and absolutely positions it; a width change on categories 6, 11, 7 or 12
  needs its own verification pass.
- **R6 — the admin editor.** The component is git-installed, so any fix made in the admin CSS
  editor is silently overwritten on the next Update. Every step here goes through
  commit → push → Update.

---

## Open questions

1. Should leaderboard avatars be round? If yes, that is an exception to
   `* { border-radius: 0 !important }`, not a change to `leaderboard.scss`.
2. Is a dark colour scheme in scope, ever? A yes reverses D4.
3. Which consumers of `--spc-gray-200` / `--stroke-1` exist outside `challenge.scss`? D6 is
   blocked on this.
4. Category 11's identity — still undocumented, appears only in
   `masonry_categories = 6|11|7|12`.
5. Do steps 1–7 ship as one Update or seven? Seven is safer to bisect; one is less churn on a
   live site. Recommendation: seven, since an Update preserves every setting whose name is
   unchanged and none of these steps rename a setting.
