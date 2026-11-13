import { apiInitializer } from "discourse/lib/api";
import { i18n } from "discourse-i18n";
import SpcHomeDoors from "../components/spc-home-doors";
import SpcHomeRows from "../components/spc-home-rows";

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

  if (!contents || !tbody) {
    return;
  }

  contents.dataset.spcLatestLabel = translated("latest");

  // Find the official challenge brief row: the pinned topic in the challenge
  // category. It used to be matched by the title on the homepage's monthly
  // card first; that card went with the category grid in Phase E.
  const rows = Array.from(
    tbody.querySelectorAll("tr.topic-list-item:not(.spc-home-monthly-prompt--synthetic)")
  );
  const promptRow =
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
  api.renderInOutlet("above-main-container", SpcHomeDoors);
  api.renderInOutlet("above-main-container", SpcHomeRows);
  let queued = false;

  function render() {
    queued = false;
    if (!document.body.classList.contains("navigation-topics")) {
      return;
    }

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
