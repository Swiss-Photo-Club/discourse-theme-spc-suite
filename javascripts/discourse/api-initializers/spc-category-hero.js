import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import { clearHero, renderHero, uploadUrl } from "../lib/spc-hero";

const RENDER_THROTTLE_MS = 200;

/**
 * The category hero registry.
 *
 * Keyed by category ID, never by slug: category 10's slug is `support` while it
 * displays as "Post Processing", so slug-looks-like-the-name reasoning is wrong
 * on this site. (The one place slugs are unavoidable is category-hero.scss,
 * because the body class Discourse emits carries the slug.)
 *
 * `key` names the locale block — hero.<key>.eyebrow / .headline / .actions.*.
 * `actions` is a function rather than data because the spec's `actions[].href`
 * schema does not survive contact with these categories: critique's primary
 * depends on critique_image_use_form AND the locale suffix, introductions'
 * is a locale-suffixed wizard URL, and only meetups' is a literal setting. A
 * schema field four of five call sites cannot use is unshipped API.
 *
 * Adding a category means three edits that ship together: an entry here, its
 * slug in category-hero.scss, and a locale block in all three locales.
 */
const CATEGORY_HEROES = {
  // 10 — Post Processing (slug `support`). List mode, so no masonry exposure.
  10: {
    key: "post_processing",
    variant: "category",
    actions: (category) => [
      {
        label: heroText("post_processing", "actions.ask"),
        href: `/new-topic?category=${category.slug}`,
        style: "primary",
      },
    ],
  },
};

function heroText(key, suffix) {
  return i18n(themePrefix(`hero.${key}.${suffix}`));
}

function enabledCategoryIds() {
  const value = settings.hero_enabled_categories;
  const values = Array.isArray(value) ? value : String(value || "").split("|");

  return values.map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * The gate. Cheap, synchronous, and checked before any work — the same
 * discipline the networked renderers use, kept here even though nothing in
 * this file can fetch, so that it stays true if someone later adds a variant
 * that can.
 */
function activeHeroCategory() {
  if (!document.body.classList.contains("navigation-category")) {
    return null;
  }

  for (const id of enabledCategoryIds()) {
    const entry = CATEGORY_HEROES[id];
    if (!entry) {
      // Listed in settings but unknown to the registry: nothing to render.
      // Documented in the setting's description rather than logged, because
      // the observer would log it on every mutation.
      continue;
    }

    const category = Category.findById(id);
    if (
      category?.slug &&
      document.body.classList.contains(`category-${category.slug}`)
    ) {
      return { id, entry, category };
    }
  }

  return null;
}

/**
 * The lead. `description_excerpt` is plain text and already localised, which is
 * the whole point of reading it: the hero is not a second place to author a
 * category description. `description` is HTML, so it is only a fallback and is
 * flattened through textContent rather than trusted as markup.
 */
function categoryLead(category) {
  if (category.description_excerpt) {
    return category.description_excerpt;
  }
  if (!category.description) {
    return "";
  }
  const container = document.createElement("div");
  container.innerHTML = category.description;
  return container.textContent.trim();
}

export default apiInitializer((api) => {
  let renderQueued = false;

  function render() {
    if (!settings.enable_category_hero) {
      clearHero();
      return;
    }

    const active = activeHeroCategory();
    if (!active) {
      clearHero();
      return;
    }

    const { id, entry, category } = active;
    const cover = uploadUrl(category.uploaded_background);
    const locale = document.documentElement.lang || "en";

    renderHero({
      marker: String(id),
      variant: entry.variant,
      signature: `${id}-${locale}-${cover}`,
      eyebrow: heroText(entry.key, "eyebrow"),
      title: heroText(entry.key, "headline") || category.name,
      lead: categoryLead(category),
      cover,
      actions: entry.actions(category),
    });
  }

  // Throttled on a timer, leading edge — never requestAnimationFrame. The
  // observer below watches all of document.body and every render mutates the
  // DOM, so frame-level debouncing lets a render feed the observer that
  // schedules the next one.
  function scheduleRender() {
    if (renderQueued) {
      return;
    }
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      try {
        render();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("SPC Category Hero: rendering failed", error);
      }
    }, RENDER_THROTTLE_MS);
  }

  api.onPageChange(scheduleRender);
  new MutationObserver(scheduleRender).observe(document.body, {
    childList: true,
    subtree: true,
  });
  scheduleRender();
});
