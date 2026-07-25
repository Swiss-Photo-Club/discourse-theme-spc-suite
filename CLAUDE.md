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
seven original components used to produce. **`challenge-staff` must stay last** — it re-shows
the staff topic-admin wrench purely by being later in the cascade than the rules that hide the
footer actions.

**`branding.scss` opens with `* { border-radius: 0 !important }`.** An `!important` declaration
on the universal selector beats an unqualified one regardless of specificity or source order, so
any plain `border-radius` anywhere else in the component is dead code. Exceptions must be a
class selector carrying `!important`, and they live in `branding.scss` next to the reset.

**Renaming a setting has THREE edit sites** — `settings.yml`, the JS (`settings.foo`) and the
SCSS (`$foo`). `scss/critique-submit.scss` is the one partial that interpolates settings.

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
`masonry_categories = 6|11|7|12`.

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
intended. For a token rename, additionally expand every `--spc-*` to its literal hex in both
outputs before diffing — that turns "should be identical" into a proof.

This does **not** catch the basename-import trap. Only an Update does.

## Assets, locales, colours

`assets/` carries the five branding files (Open Sans ×4 + `JWIM4133.jpg`), declared in
`about.json` and referenced in SCSS as `$OpenSans-Light` etc. **They exist nowhere else outside
the Discourse database — do not delete them.**

Locale namespaces are per feature: `critique_workspace.*`, `critique_submit.*`, `critique_form.*`,
`onboarding.*`, `nonmember_banner.*`. Note `banner.*` is already taken by the submit banner,
hence `nonmember_banner.*`.

Two colour systems coexist **by design**. `branding`, `challenge`, `homepage`, `onboarding` and
`non-member-banner` use hardcoded `--spc-*` tokens. `submit`, `leaderboard` and
`critique-workspace` use Discourse core palette tokens (`--primary`, `--tertiary`, …) and are the
only files that would survive a dark colour scheme. A dark scheme **is** in scope, so keep
hardcoded hex out of those three.

## Load-bearing strings

`javascripts/discourse/lib/spc-critique.js` holds every critique heading. They are matched
**literally** by `lib/spc-parse-request.js` to rebuild a request for the workspace modal, and
they reproduce the Custom Wizard's Liquid `post_template` byte-for-byte so wizard-made and
form-made posts stay interchangeable. They live in JS rather than `locales/*.yml` **so a
translator cannot silently break the parser.** Changing a heading means editing three places:
`spc-critique.js`, `spc-parse-request.js`, and the three wizard definitions in the admin.

## Rollback

`critique_image_use_form` off is the instant rollback for the critique form — no commit, no
Update. The seven disabled components (3, 12, 19, 20, 23, 36, 37) are the rollback path for the
merged-in features; their settings are intact in the database. Do not delete them yet.
