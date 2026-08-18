import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import { categoryUrlFor } from "../lib/spc-submit-helpers";

const MONTHLY_SELECTOR =
  '.featured-categories__category-link[data-spc-monthly-challenge="home"], .featured-categories__category-link[href="/c/monthly-challenge/6"]';
const CRITIQUE_CATEGORY_ID = 7;
const CRITIQUE_SELECTOR = [
  `.featured-categories__category-container[data-spc-category-id="${CRITIQUE_CATEGORY_ID}"] > .featured-categories__category-link`,
  '.featured-categories__category-link[href="/c/photo-feedback/7"]',
  '.featured-categories__category-link[href="/c/critique-portfolio-reviews/7"]',
].join(", ");
const FEEDBACK_SELECTOR = [
  '.featured-categories__category-container[data-spc-category-id="2"] > .featured-categories__category-link',
  '.featured-categories__category-link[href="/c/feedback/2"]',
].join(", ");

function translated(key, options) {
  return i18n(themePrefix(`homepage.${key}`), options);
}

function setText(element, value) {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  if (text) {
    element.textContent = text;
  }
  return element;
}

function ensureFeatureDecoration(link, actionKey) {
  if (!link) {
    return;
  }

  link.dataset.spcHomeFeature = actionKey;

  let badge = link.querySelector(":scope > .spc-home-feature-badge");
  if (!badge) {
    badge = makeElement("span", "spc-home-feature-badge");
    link.prepend(badge);
  }
  setText(badge, translated("highlight"));

  let cta = link.querySelector(":scope > .spc-home-feature-cta");
  if (!cta) {
    cta = makeElement("span", "spc-home-feature-cta");
    link.append(cta);
  }
  setText(cta, translated(`actions.${actionKey}`));
}

function syncCritiqueCategory(link, site) {
  if (!link) {
    return;
  }

  const category = site?.categories?.find(
    ({ id }) => id === CRITIQUE_CATEGORY_ID
  );
  if (!category) {
    return;
  }

  setText(link.querySelector(".badge-category__name"), category.name);
  setText(
    link.querySelector(".category-description"),
    category.description_text || ""
  );

  const backgroundUrl = category.uploaded_background?.url;
  if (backgroundUrl) {
    link.style.setProperty(
      "--spc-critique-cover",
      `url(${JSON.stringify(backgroundUrl)})`
    );
  } else {
    link.style.removeProperty("--spc-critique-cover");
  }
}

function ensureSmallCardMeta(link, label = translated("view_category")) {
  if (!link) {
    return;
  }

  let meta = link.querySelector(":scope > .spc-home-category-meta");
  if (!meta) {
    meta = makeElement("span", "spc-home-category-meta");
    link.append(meta);
  }
  setText(meta, label);
}

// The card links to the webinar category when webinars_category_id resolves to
// one — slug taken from the live category, never from a setting, so a slug
// rename in category admin is followed automatically. webinars_url is only the
// fallback for an unset or deleted category, which is what it was before the
// category existed.
function webinarsUrl() {
  const categoryId = Number(settings.webinars_category_id);
  if (categoryId > 0 && Category.findById(categoryId)) {
    return categoryUrlFor(categoryId);
  }
  return settings.webinars_url || "/upcoming-events";
}

function ensureWebinarCard(list, feedbackContainer) {
  let container = list.querySelector('[data-spc-home-card="webinars"]');
  if (!container) {
    container = makeElement(
      "div",
      "featured-categories__category-container spc-home-webinar-card"
    );
    container.dataset.spcHomeCard = "webinars";

    const link = makeElement(
      "a",
      "featured-categories__category-link spc-home-webinar-link"
    );
    const title = makeElement("h3", "category-name");
    const description = makeElement("span", "category-description");
    link.append(title, description);
    container.append(link);

    if (feedbackContainer) {
      list.insertBefore(container, feedbackContainer);
    } else {
      list.append(container);
    }
  }

  const link = container.querySelector("a");
  const targetUrl = webinarsUrl();
  if (link.getAttribute("href") !== targetUrl) {
    link.setAttribute("href", targetUrl);
  }
  setText(link.querySelector(".category-name"), translated("webinars.title"));
  setText(
    link.querySelector(".category-description"),
    translated("webinars.description")
  );
  ensureSmallCardMeta(link, translated("webinars.meta"));
}

function enhanceCategories(site) {
  const root = document.querySelector(
    settings.enable_local_featured_categories
      ? '[data-spc-featured-categories="local"]'
      : ".featured-categories"
  );
  const list = root?.querySelector(".featured-categories__list-container");
  if (!root || !list) {
    return;
  }

  setText(
    root.querySelector(".featured-categories__title"),
    translated("popular_categories")
  );
  setText(
    root.querySelector(".featured-categories__link"),
    translated("all_categories")
  );

  const monthly = root.querySelector(MONTHLY_SELECTOR);
  const critique = root.querySelector(CRITIQUE_SELECTOR);
  syncCritiqueCategory(critique, site);
  ensureFeatureDecoration(monthly, "challenge");
  ensureFeatureDecoration(critique, "critique");

  root
    .querySelectorAll(
      ".featured-categories__category-link[href]:not(.spc-home-webinar-link)"
    )
    .forEach((link) => {
      if (link !== monthly && link !== critique) {
        ensureSmallCardMeta(link);
      }
    });

  // The feedback card keeps the category's own localised name and
  // description, like every other compact card. It used to be relabelled
  // "Site Feedback / Help shape the community." from the locale files, a
  // leftover from before the category carried real copy — the card only
  // matters here as the anchor the webinars card is inserted before.
  const feedback = root.querySelector(FEEDBACK_SELECTOR);

  ensureWebinarCard(list, feedback?.closest(".featured-categories__category-container"));
}

// The brief row is a real topic card with a real photo. Only ever add
// absolutely-positioned decoration to it: anything that changes the row's
// height desynchronises the masonry layout engine, which has already
// measured and positioned every card.
function ensurePromptBadge(row) {
  const host =
    row.querySelector(":scope > .topic-list-thumbnail") ||
    row.querySelector(":scope > .main-link");
  if (!host) {
    return;
  }

  let badge = host.querySelector(":scope > .spc-home-pinned-badge");
  if (!badge) {
    badge = makeElement("span", "spc-home-pinned-badge");
    host.append(badge);
  }
  setText(badge, translated("monthly_prompt"));
}

function enhanceTopicFeed() {
  const contents = document.querySelector("#list-area > .contents");
  const tbody = contents?.querySelector(".topic-list > tbody");
  const monthlyCard = document.querySelector(MONTHLY_SELECTOR);
  const promptTitle = monthlyCard
    ?.querySelector(".spc-monthly-card__title")
    ?.textContent?.trim();

  if (!contents || !tbody || !monthlyCard) {
    return;
  }

  contents.dataset.spcLatestLabel = translated("latest");

  // Find the official challenge brief row. Match by title first, with a
  // structural fallback (the brief is the pinned topic in the challenge
  // category) so async hydration or localized titles can't mis-match.
  const rows = Array.from(
    tbody.querySelectorAll("tr.topic-list-item:not(.spc-home-monthly-prompt--synthetic)")
  );
  const promptRow =
    (promptTitle &&
      rows.find(
        (row) =>
          row
            .querySelector(".topic-list-thumbnail a[aria-label]")
            ?.getAttribute("aria-label")
            ?.trim() === promptTitle
      )) ||
    rows.find(
      (row) =>
        row.matches(".category-monthly-challenge") &&
        row.querySelector(".topic-statuses .d-icon-thumbtack")
    ) ||
    rows.find((row) => row.matches(".category-general.closed"));

  // Never fabricate a synthetic row: the masonry layout engine doesn't know
  // about it and it renders on top of real cards. Clean up any stale one.
  tbody.querySelector('[data-spc-home-prompt="synthetic"]')?.remove();

  if (!promptRow) {
    return;
  }

  promptRow.classList.add("spc-home-monthly-prompt");

  // Clean up the old header block: it used to be prepended into the row and
  // it both hid the topic's photo and broke the masonry column heights.
  promptRow.querySelector(":scope > .spc-home-prompt-header")?.remove();

  ensurePromptBadge(promptRow);

  // Note: no tbody.prepend() here — reordering rows inside the masonry list
  // breaks its positioning; the decorated card keeps its natural slot.
}

function ensureGuestAction(currentUser) {
  const controls = document.querySelector(
    ".list-controls .navigation-container .navigation-controls"
  );
  if (!controls) {
    return;
  }

  const existing = controls.querySelector(".spc-home-login-cta");
  if (currentUser) {
    existing?.remove();
    return;
  }

  if (!existing) {
    const link = makeElement(
      "a",
      "btn spc-home-login-cta",
      translated("login_to_post")
    );
    link.setAttribute("href", "/login");
    controls.append(link);
  } else {
    setText(existing, translated("login_to_post"));
  }
}


const spcRun = (api) => {
  const currentUser = api.getCurrentUser();
  const site = api.container.lookup("service:site");
  let queued = false;

  function render() {
    queued = false;
    if (!document.body.classList.contains("navigation-topics")) {
      return;
    }

    enhanceCategories(site);
    enhanceTopicFeed();
    ensureGuestAction(currentUser);
  }

  function scheduleRender() {
    if (queued) {
      return;
    }
    queued = true;
    window.requestAnimationFrame(render);
  }

  api.onPageChange(scheduleRender);
  new MutationObserver(scheduleRender).observe(document.body, {
    childList: true,
    subtree: true,
  });
  scheduleRender();
};

export default apiInitializer(spcRun);
