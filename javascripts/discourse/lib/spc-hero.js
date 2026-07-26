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
 * The hero is our OWN element, inserted before `.category-title-header` and
 * removed by clearHero(). It never rewrites that node. Ember keeps the core
 * header across category navigations, so writing into it leaves one category's
 * hero on screen after moving to the next — the bug the challenge hero already
 * had and fixed.
 */

const ANCHOR_SELECTOR = ".category-title-header";
const HERO_SELECTOR = "[data-spc-hero]";

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value == null ? "" : String(value);
  return element.innerHTML;
}

/** Remove the hero, if one is on the page. Safe to call anywhere. */
export function clearHero() {
  document.querySelector(HERO_SELECTOR)?.remove();
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

function ensureHero(marker, variant) {
  const existing = document.querySelector(HERO_SELECTOR);

  if (existing) {
    // Same element, different category: reset the variant rather than
    // inserting a second hero.
    if (existing.dataset.spcHero !== marker) {
      existing.dataset.spcHero = marker;
      delete existing.dataset.spcHeroSignature;
    }
    existing.className = `spc-hero spc-hero--${variant}`;
    return existing;
  }

  const anchor = document.querySelector(ANCHOR_SELECTOR);
  if (!anchor) {
    // The anchor is Ember-rendered and may not exist on the first pass. The
    // observer will call again; rendering into #main-outlet directly instead
    // would fight core on navigation.
    return null;
  }

  const hero = document.createElement("section");
  hero.className = `spc-hero spc-hero--${variant}`;
  hero.dataset.spcHero = marker;
  hero.setAttribute("aria-labelledby", "spc-hero-title");
  anchor.insertAdjacentElement("beforebegin", hero);
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
 * Build or update the hero.
 *
 * @param {object} config
 * @param {string} config.marker     identifies which hero this is (the category id)
 * @param {string} config.variant    modifier class suffix, e.g. "category"
 * @param {string} config.signature  re-render guard; equal signature = no work
 * @param {string} config.eyebrow    kicker — the category's role, not its name
 * @param {string} config.title      the headline
 * @param {string} [config.lead]     one sentence, from category.description_excerpt
 * @param {string} [config.cover]    background image URL
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
    ${config.cover ? `<div class="spc-hero__shade"></div>` : ""}
    <div class="spc-hero__content">
      ${
        config.eyebrow
          ? `<span class="spc-eyebrow">${escapeHtml(config.eyebrow)}</span>`
          : ""
      }
      <h1 id="spc-hero-title">${escapeHtml(config.title)}</h1>
      ${config.lead ? `<p>${escapeHtml(config.lead)}</p>` : ""}
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
