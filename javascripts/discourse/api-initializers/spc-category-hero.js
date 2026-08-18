import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import { clearHero, renderHero, uploadUrl } from "../lib/spc-hero";
import { gatePostingHref } from "../lib/spc-membership";

const RENDER_THROTTLE_MS = 200;

/**
 * Category-specific hero overrides.
 *
 * Every category gets the generic hero automatically. Entries here exist only
 * where a category needs a more specific eyebrow or actions. They are keyed by
 * category ID, never by slug: category 10's slug is `support` while it displays
 * as "Post Processing", so slug-looks-like-the-name reasoning is wrong.
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
 * Adding a category requires no theme edit. Add an entry here only when the
 * generic "Community category / Start a topic" treatment is not enough.
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
  // that setting is the homepage Monthly Live Webinars card's fallback
  // destination and only happens to share this default, so pointing the hero
  // at it would mean retargeting the webinars card silently moved the meetups
  // hero too.
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

// Live Webinars — matched on the webinars_category_id setting rather than a
// literal id because, unlike the categories above, this one was created after
// the theme and its id is an admin fact the theme should not have to know. It
// is not in CATEGORY_HEROES because that literal is evaluated at module load,
// and settings are read lazily everywhere else in this theme on purpose. A
// stock list category: no masonry exposure.
//
// Browse before create, like meetups: every member wants to find the next
// webinar; only instructors and staff announce one, and Category.permission is
// what says who. The category has no scoped calendar route (the plugin 404s
// /c/<slug>/<id>/l/calendar), so the browse action goes to the site-wide
// /upcoming-events like the meetups hero. Recordings need no action of their
// own — they are the topic list directly under this hero.
const WEBINARS_HERO = {
  key: "webinars",
  variant: "category",
  actions: (category, currentUser) => [
    {
      label: heroText("webinars", "actions.upcoming"),
      href: "/upcoming-events",
      style: "primary",
    },
    ...(canOfferCreateTopic(category, currentUser)
      ? [
          {
            label: heroText("webinars", "actions.announce"),
            href: `/new-topic?category=${category.slug}`,
            style: "secondary",
          },
        ]
      : []),
  ],
};

function isWebinarsCategory(id) {
  const webinarsId = Number(settings.webinars_category_id);
  return webinarsId > 0 && id === webinarsId;
}

const DEFAULT_CATEGORY_HERO = {
  key: "generic",
  variant: "category",
  actions: (category, currentUser) =>
    canOfferCreateTopic(category, currentUser)
      ? [
          {
            label: heroText("generic", "actions.create"),
            href: `/new-topic?category=${category.slug}`,
            style: "primary",
          },
        ]
      : [],
};

/**
 * Category.canCreateTopic (permission === FULL) is the only signal there is.
 * Site#categories serialises `permission` as FULL for categories the viewer
 * may create topics in and omits it otherwise — a Reply/See or See-only member
 * therefore gets exactly the `null` a not-yet-loaded category would. Until
 * 2026-08-18 this treated null as "still loading, keep the button", which
 * showed a create action to every signed-in member in every category they
 * could not post in (Announcements, Live Webinars). There is no non-FULL value
 * to distinguish the two states, so null has to mean no.
 */
function canOfferCreateTopic(category, currentUser) {
  return Boolean(currentUser) && Boolean(category?.canCreateTopic);
}

function heroText(key, suffix) {
  return i18n(themePrefix(`hero.${key}.${suffix}`));
}

function categoryForRoute(router) {
  if (!document.body.classList.contains("navigation-category")) {
    return null;
  }

  const slugPathWithId =
    router?.currentRoute?.params?.category_slug_path_with_id;
  return slugPathWithId
    ? Category.findBySlugPathWithID(slugPathWithId)
    : null;
}

/**
 * The gate. Cheap, synchronous, and checked before any work — the same
 * discipline the networked renderers use, kept here even though nothing in
 * this file can fetch, so that it stays true if someone later adds a variant
 * that can.
 */
function activeHeroCategory(category) {
  const id = Number(category?.id);

  // The Monthly Challenge has a data-backed hero with its own lifecycle. It
  // deliberately shares renderHero(), but it does not use this generic path.
  if (!id || id === Number(settings.challenge_category_id)) {
    return null;
  }

  return {
    id,
    category,
    entry: isWebinarsCategory(id)
      ? WEBINARS_HERO
      : CATEGORY_HEROES[id] || DEFAULT_CATEGORY_HERO,
  };
}

function categoryCreateLabel(category) {
  const id = Number(category?.id);

  if (id === Number(settings.challenge_category_id)) {
    return i18n(themePrefix("monthly_challenge.submit_photo"));
  }
  if (id === Number(settings.critique_category_id)) {
    return i18n(themePrefix("critique_submit.image_button"));
  }
  if (id === Number(settings.critique_intro_category_id)) {
    return i18n(themePrefix("category_actions.new_introduction"));
  }
  if (id === 8) {
    return heroText("meetups", "actions.propose");
  }
  if (isWebinarsCategory(id)) {
    return heroText("webinars", "actions.announce");
  }
  if (id === 10) {
    return i18n(themePrefix("category_actions.ask_question"));
  }
  return i18n(themePrefix("category_actions.new_topic"));
}

/**
 * Keep Discourse's native list-controls action, but name the action for the
 * workflow it actually opens. The route layer remains authoritative: critique,
 * introductions and challenge buttons are redirected to their SPC forms.
 *
 * The label rides in a data attribute that homepage.scss renders through
 * ::before — never in the button's text. The text node inside .d-button-label
 * belongs to Glimmer; replacing it via textContent detaches the node Glimmer
 * tracks, and core's next re-render of the button dies in removeChild. That
 * exception aborts the whole render transaction, so the symptom is nowhere
 * near this function: the topic list freezes on the next category navigation
 * and every listing after it shows the previous category's topics.
 */
function updateCreateTopicButton(category) {
  const button = document.querySelector("#create-topic");
  const labelElement = button?.querySelector(".d-button-label");
  if (!labelElement) {
    return;
  }

  if (!category) {
    // Off the category routes: hand the native label back. The text node
    // still holds core's own localized label because nothing ever writes to
    // it, so it is also the restore value for the aria-label we overwrote.
    if (labelElement.dataset.spcLabel) {
      delete labelElement.dataset.spcLabel;
      button.setAttribute("aria-label", labelElement.textContent.trim());
      button.removeAttribute("title");
    }
    return;
  }

  const label = categoryCreateLabel(category);
  if (labelElement.dataset.spcLabel !== label) {
    labelElement.dataset.spcLabel = label;
  }
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

/**
 * The explanation band reads the native, localised category description. The
 * About topic remains the single admin-owned source; HTML is flattened through
 * textContent rather than trusted as markup in the shared page shell.
 */
function categoryDescription(category) {
  const value = category.description || category.description_excerpt;
  if (!value) {
    return "";
  }
  const container = document.createElement("div");
  container.innerHTML = value;
  return container.textContent.trim();
}

function categoryTopicUrl(category) {
  return category.topic_url || category.topicUrl || "";
}

export default apiInitializer((api) => {
  const router = api.container.lookup("service:router");
  const currentUser = api.getCurrentUser();
  let renderQueued = false;
  let renderedMarker = null;

  // Core renders its list-controls New Topic button for any member with
  // global create rights even inside a category they cannot post in — the
  // controller computes createTopicDisabled from Category.canCreateTopic and
  // then only honours it behind hide_disabled_create_topic_button, a hidden
  // site setting with no admin UI. Same decision, made through the value
  // transformer core applies right after that check. Categories where the
  // viewer can post are untouched: createTopicDisabled is false there and the
  // value passes through. This is core's own button and its own flag; the
  // theme still never touches the element.
  api.registerValueTransformer(
    "can-create-topic-button",
    ({ value, context }) => (context?.createTopicDisabled ? false : value)
  );

  /**
   * Clear only the category hero this initializer last rendered.
   *
   * The challenge initializer can re-marker the shared element as "challenge"
   * before this one observes the navigation. clearHero() checks the marker, so
   * that race is harmless and this function never deletes the challenge hero.
   */
  function clearOwnHero() {
    if (renderedMarker) {
      clearHero(renderedMarker);
      renderedMarker = null;
    }
  }

  function render() {
    const routeCategory = categoryForRoute(router);
    updateCreateTopicButton(routeCategory);

    if (!settings.enable_category_hero) {
      clearOwnHero();
      return;
    }

    const active = activeHeroCategory(routeCategory);
    if (!active) {
      clearOwnHero();
      return;
    }

    const { id, entry, category } = active;
    const cover = uploadUrl(category.uploaded_background);
    const locale = document.documentElement.lang || "en";
    // Posting actions (/submit/*, /new-topic) go to the members-only page for
    // visitors who cannot post — Discourse would only hide the button or 403
    // the composer, and the /submit routes redirect anyway; rewriting here
    // makes the hero honest about where the click ends up. Browse links stay.
    const actions = entry
      .actions(category, currentUser)
      .map((entryAction) => ({
        ...entryAction,
        href: gatePostingHref(entryAction.href, currentUser),
      }));
    const description = categoryDescription(category);
    const topicUrl = categoryTopicUrl(category);

    const hero = renderHero({
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
        category.name,
        description,
        topicUrl,
        actions.map((action) => action.href || action.label).join("|"),
      ].join("-"),
      eyebrow: heroText(entry.key, "eyebrow"),
      title: category.name,
      introduction: {
        body: description,
        href: topicUrl,
        label: heroText("generic", "read_more"),
      },
      cover,
      actions,
    });

    if (hero) {
      renderedMarker = String(id);
    }
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
