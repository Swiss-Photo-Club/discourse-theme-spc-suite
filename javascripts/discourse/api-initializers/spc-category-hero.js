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
 * `key` names the locale block — hero.<key>.eyebrow and, where the action
 * labels are not already written down somewhere better, hero.<key>.actions.*.
 *
 * There is deliberately no headline key. Every category's headline turned out
 * to be its own name, and Discourse already localises that — writing it out a
 * second time only creates a string that can drift out of step with the
 * sidebar and the breadcrumb.
 *
 * `actions` is a function rather than data because the spec's `actions[].href`
 * schema did not survive contact with these categories: two of them build a URL
 * from the category, and the three critique/introduction destinations were
 * settings-switched and locale-suffixed for as long as their wizards existed. A
 * schema field most call sites cannot use is unshipped API. Three of the five
 * are literal paths today; the function stays because it is what let those
 * three become literal without touching a schema.
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

  // 8 — Meetups & Photowalks. Masonry, but the hero adds no height to any
  // topic row, so it cannot desynchronise the layout.
  //
  // Browse before create, which inverts the other heroes on purpose: far more
  // members want to find a meetup than to organise one. /upcoming-events is
  // hardcoded rather than read from webinars_url as the spec suggested —
  // that setting is the homepage Monthly Live Webinars card's destination and
  // only happens to share this default, so pointing the hero at it would mean
  // retargeting the webinars card silently moved the meetups hero too.
  8: {
    key: "meetups",
    variant: "category",
    actions: (category) => [
      {
        label: heroText("meetups", "actions.upcoming"),
        href: "/upcoming-events",
        style: "primary",
      },
      {
        label: heroText("meetups", "actions.propose"),
        href: `/new-topic?category=${category.slug}`,
        style: "secondary",
      },
    ],
  },

  // 7 — Critique / Portfolio Reviews. Masonry with real rows, so this is the
  // first hero that could desynchronise a layout if it ever grew a rule
  // touching a topic row. It does not: it sits above the list and adds no
  // height to any tr.topic-list-item.
  //
  // Also the first coverless hero — category 7 has no uploaded_background,
  // which is what the --with-cover split exists for.
  //
  // Both actions are the ones the floating .spc-critique-submit row used to
  // carry. Their labels stay on critique_submit.* rather than moving into
  // hero.*: they are the same two buttons in a new place, and re-keying them
  // would have thrown away translations that already exist.
  //
  // Both destinations are hardwired now. Their wizards have been deleted, so
  // there is nothing for a setting to fall back to, and a rollback switch
  // pointing at a wizard that no longer exists is worse than no switch at all —
  // it looks like a way out and lands on a 404. Rolling either form back means
  // reverting the commit and running an Update.
  7: {
    key: "critique",
    variant: "category",
    actions: () => [
      {
        label: i18n(themePrefix("critique_submit.image_button")),
        href: "/submit/critique",
        style: "primary",
      },
      {
        label: i18n(themePrefix("critique_submit.project_button")),
        href: "/submit/project",
        style: "secondary",
      },
    ],
  },

  // 12 — New Member Introductions. Masonry, no cover: the second coverless
  // hero.
  //
  // One action, hardwired to the form that replaced the wizard. The spec once
  // wanted this to read onboarding_introduce_url_{de,en,fr} so that the hero and
  // the onboarding panel could not drift apart; that problem solved itself when
  // both became the same literal path and all six locale settings went away.
  //
  // No secondary. The spec suggested linking a guide topic, but the only guide
  // setting this component has is the challenge's, and inventing a destination
  // is worse than an honest single action.
  12: {
    key: "introductions",
    variant: "category",
    actions: () => [
      {
        label: i18n(themePrefix("critique_submit.intro_button")),
        href: "/submit/introduction",
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
 * Clear the hero, but only if it is one of ours.
 *
 * clearHero() is marker-scoped now that the monthly challenge renders through
 * the same function, so this asks about every marker this module can own rather
 * than deleting whatever hero happens to be on the page. Arriving on category 6
 * that distinction is the whole ballgame: an unscoped clear here would race the
 * challenge initializer and delete the challenge hero.
 */
function clearOwnHero() {
  for (const id of Object.keys(CATEGORY_HEROES)) {
    clearHero(id);
  }
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
      clearOwnHero();
      return;
    }

    const active = activeHeroCategory();
    if (!active) {
      clearOwnHero();
      return;
    }

    const { id, entry, category } = active;
    const cover = uploadUrl(category.uploaded_background);
    const locale = document.documentElement.lang || "en";
    const actions = entry.actions(category);

    renderHero({
      marker: String(id),
      variant: entry.variant,
      // Destinations are part of the signature because some of them are still
      // derived from settings — meetups' primary is /upcoming-events only until
      // someone changes it — and a hero that only kept the category in its
      // signature would go on showing the previous destination.
      signature: [
        id,
        locale,
        cover,
        actions.map((action) => action.href || action.label).join("|"),
      ].join("-"),
      eyebrow: heroText(entry.key, "eyebrow"),
      title: category.name,
      lead: categoryLead(category),
      cover,
      actions,
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
