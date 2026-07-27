/**
 * The shared category hero renderer.
 *
 * One exported function builds the element every category hero uses. What
 * differs per category is which slots are filled and where the actions point —
 * never the shell, the type scale or the button geometry. Those live in
 * hero.scss and are shared with the challenge and invitation variants.
 *
 * THIS FILE MAKES NO NETWORK REQUEST, AND MUST NOT GAIN ONE. Everything it
 * renders comes off the Category model that Discourse preloads into
 * /site.json: the cover from `uploaded_background`, the lead from
 * `description_excerpt`. A header is on every category page a member opens, so
 * a fetch here would be the same shape as the renderer that produced the
 * site-wide 429 storm, on the busiest surface in the component. The spec
 * dropped both the meetups date line and the critique subject chips for
 * exactly this reason: drop the slot rather than fetch for it.
 *
 * The hero is our OWN element, appended to SPC Suite's category surface and
 * removed by clearHero(). It never rewrites a core node. Ember keeps its
 * category controls across category navigations, so writing into one leaves
 * the previous category's content behind — the bug the challenge hero already
 * had and fixed.
 */

const SURFACE_SELECTOR = "[data-spc-category-surface]";
const HERO_SELECTOR = "[data-spc-hero]";

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value == null ? "" : String(value);
  return element.innerHTML;
}

/**
 * Remove the hero, but only if it is the one `marker` owns.
 *
 * Scoping matters because two initializers render heroes now — the category
 * registry and the monthly challenge — and both run off their own observers in
 * no fixed order. An unscoped clear meant whichever ran second deleted the
 * other's work: arriving on category 6, the category initializer would see a
 * category it does not own and wipe the challenge hero that had just rendered.
 * Checking the marker makes the two orders equivalent, because the module that
 * no longer owns the page finds a marker that is not its own and does nothing.
 */
export function clearHero(marker) {
  const hero = document.querySelector(HERO_SELECTOR);
  if (hero && hero.dataset.spcHero === String(marker)) {
    hero.remove();
  }
}

/**
 * Discourse hands uploads over in more than one shape depending on whether the
 * value came from a setting, a serializer or a preload. Same helper as the
 * challenge renderer's.
 */
export function uploadUrl(value) {
  if (Array.isArray(value)) {
    return uploadUrl(value[0]);
  }
  if (value && typeof value === "object") {
    return value.url || value.original_url || "";
  }
  return typeof value === "string" ? value : "";
}

export function categorySurface() {
  return document.querySelector(SURFACE_SELECTOR);
}

function ensureHero(marker, variant) {
  const existing = document.querySelector(HERO_SELECTOR);

  if (existing) {
    // Same element, different category: re-marker it rather than inserting a
    // second hero.
    if (existing.dataset.spcHero !== marker) {
      existing.dataset.spcHero = marker;
      delete existing.dataset.spcHeroSignature;
    }
    // Only rewrite the class list when the variant actually changed. Doing it
    // unconditionally stripped .spc-hero--with-cover on every re-render, and
    // because the signature check below returns early when nothing else moved,
    // the class never came back — a covered hero silently fell through to the
    // coverless min-height.
    if (!existing.classList.contains(`spc-hero--${variant}`)) {
      existing.className = `spc-hero spc-hero--${variant}`;
      delete existing.dataset.spcHeroSignature;
    }
    return existing;
  }

  const surface = categorySurface();
  if (!surface) {
    // The outlet component may not exist on the first pass. The observer will
    // call again; rendering into #main-outlet directly instead would put this
    // renderer back in competition with Ember's route lifecycle.
    return null;
  }

  const hero = document.createElement("section");
  hero.className = `spc-hero spc-hero--${variant}`;
  hero.dataset.spcHero = marker;
  hero.setAttribute("aria-labelledby", "spc-hero-title");
  surface.append(hero);
  return hero;
}

function actionMarkup(action) {
  const label = escapeHtml(action.label);
  const style = action.style === "secondary" ? "secondary" : "primary";
  const className = `spc-button spc-button--${style}`;

  // An <a> when it navigates, a <button> when it opens a dialog or is
  // intercepted — the distinction assistive technology actually acts on.
  if (action.href) {
    return `<a class="${className}" href="${escapeHtml(action.href)}">${label}</a>`;
  }
  return `<button class="${className}" type="button"${
    action.attribute ? ` ${action.attribute}` : ""
  }>${label}</button>`;
}

/**
 * The winner callout. Structured rather than an HTML string on purpose: taking
 * markup would move escaping back out to every caller, which is how the one
 * unescaped interpolation eventually gets written. Named for what it is rather
 * than as a generic "aside" — it has exactly one caller and one shape, and a
 * generic slot with one shape is an abstraction that has not earned itself.
 */
function winnerMarkup(winner) {
  if (!winner?.title) {
    return "";
  }
  return `<a class="spc-hero__winner" href="${escapeHtml(winner.href)}">
      <span>${escapeHtml(winner.label)}</span>
      <strong>${escapeHtml(winner.title)}</strong>
      ${winner.note ? `<small>${escapeHtml(winner.note)}</small>` : ""}
    </a>`;
}

/**
 * Build or update the hero.
 *
 * @param {object} config
 * @param {string} config.marker     identifies which hero this is — a category
 *                                   id, or "challenge"
 * @param {string} config.variant    modifier class suffix, e.g. "category"
 * @param {string} config.signature  re-render guard; equal signature = no work
 * @param {string} config.eyebrow    kicker — the category's role, not its name
 * @param {string} config.title      the headline
 * @param {string} [config.lead]     one sentence, from category.description_excerpt
 * @param {string} [config.meta]     status line — the challenge's deadlines
 * @param {object} [config.winner]   { href, label, title, note }, challenge only
 * @param {string} [config.cover]    background image URL
 * @param {boolean} [config.shade]   render the scrim; defaults to "only with a
 *                                   cover". The challenge passes true outright
 *                                   because its variant falls back to a
 *                                   gradient rather than to flat indigo, so it
 *                                   has something to darken even coverless.
 * @param {Array}  [config.actions]  [{ label, href?, style?, attribute? }]
 * @returns {Element|null} the hero, or null if the anchor was not ready
 */
export function renderHero(config) {
  const hero = ensureHero(config.marker, config.variant);
  if (!hero) {
    return null;
  }

  if (hero.dataset.spcHeroSignature === config.signature) {
    return hero;
  }
  hero.dataset.spcHeroSignature = config.signature;

  const actions = (config.actions || []).filter((action) => action?.label);

  hero.innerHTML = `
    ${(config.shade ?? Boolean(config.cover)) ? `<div class="spc-hero__shade"></div>` : ""}
    <div class="spc-hero__content">
      ${
        config.eyebrow
          ? `<span class="spc-eyebrow">${escapeHtml(config.eyebrow)}</span>`
          : ""
      }
      <h1 id="spc-hero-title">${escapeHtml(config.title)}</h1>
      ${config.lead ? `<p>${escapeHtml(config.lead)}</p>` : ""}
      ${
        config.meta
          ? `<span class="spc-hero__meta">${escapeHtml(config.meta)}</span>`
          : ""
      }
      ${winnerMarkup(config.winner)}
      ${
        actions.length
          ? `<div class="spc-hero__actions">${actions
              .map(actionMarkup)
              .join("")}</div>`
          : ""
      }
    </div>
  `;

  if (config.cover) {
    hero.style.setProperty(
      "--spc-hero-cover",
      `url("${config.cover.replaceAll('"', "%22")}")`
    );
    hero.classList.add("spc-hero--with-cover");
  } else {
    hero.style.removeProperty("--spc-hero-cover");
    hero.classList.remove("spc-hero--with-cover");
  }

  return hero;
}
