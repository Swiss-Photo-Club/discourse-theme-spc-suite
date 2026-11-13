import { apiInitializer } from "discourse/lib/api";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import { categorySurface } from "../lib/spc-hero";
import {
  categoryListing,
  categoryListingCoolingOff,
  photoCard,
  usersById as usersByIdFrom,
} from "../lib/spc-photo-cards";

/**
 * "Needs feedback" — the Photo Feedback photos nobody has critiqued yet,
 * newest first, as a row of small cards at the top of the category
 * (Phase B, recommendation #5). It is what lets category 7 sort its gallery
 * by date posted without burying unanswered photos under answered ones.
 *
 * Our own element inside [data-spc-category-surface], never between
 * .list-controls and #list-area, and never inside the masonry list: the
 * strip only moves the whole list down, it changes no row's height.
 *
 * Networked and driven by a body-wide MutationObserver, so it follows the
 * five observer rules in CLAUDE.md, like spc-leaderboard-strip.js.
 */

const STRIP_SELECTOR = "[data-spc-needs-feedback]";
const MAX_CARDS = 8;
const RENDER_THROTTLE_MS = 200;

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value == null ? "" : String(value);
  return element.innerHTML;
}

function text(key, options) {
  return i18n(themePrefix(`needs_feedback.${key}`), options);
}

// Rule 4: decide from the URL alone, before anything is awaited.
function activeForUrl(url) {
  const path = new URL(url || window.location.href, window.location.origin)
    .pathname;
  if (!path.startsWith("/c/")) {
    return false;
  }
  const id = Number(path.split("/").find((segment) => /^\d+$/.test(segment)));
  return id > 0 && id === Number(settings.critique_category_id);
}

function waitingTopics(data, category) {
  const aboutPath = category?.topic_url || "";
  return (data?.topic_list?.topics || [])
    .filter(
      (topic) =>
        topic.posts_count === 1 &&
        topic.image_url &&
        !topic.closed &&
        !topic.archived &&
        !aboutPath.endsWith(`/${topic.id}`)
    )
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// The card itself (photo, title, "author · age") is shared with the homepage
// rows; see lib/spc-photo-cards.js.
function cardMarkup(topic, usersById) {
  const card = photoCard(topic, usersById);
  return `
    <a class="spc-needs-feedback__card" href="${escapeHtml(card.href)}">
      <img src="${escapeHtml(card.image)}" alt="" loading="lazy">
      <span class="spc-needs-feedback__title">${escapeHtml(card.title)}</span>
      <span class="spc-needs-feedback__by">${escapeHtml(card.by)}</span>
    </a>`;
}

function stripMarkup(data, category) {
  const topics = waitingTopics(data, category);
  const usersById = usersByIdFrom(data);

  return `
    <div class="spc-needs-feedback__head">
      <h2 class="spc-needs-feedback__heading">${escapeHtml(text("title"))}</h2>
      <span>${escapeHtml(
        topics.length
          ? text("count", { count: topics.length })
          : text("empty")
      )}</span>
    </div>
    ${
      topics.length
        ? `<div class="spc-needs-feedback__row">${topics
            .slice(0, MAX_CARDS)
            .map((topic) => cardMarkup(topic, usersById))
            .join("")}</div>`
        : ""
    }`;
}

export default apiInitializer((api) => {
  let currentUrl = window.location.href;
  let renderQueued = false;
  let renderedMarkup = null;

  async function render() {
    // Cooling off counts as inactive, so a failed fetch does not keep
    // re-creating and removing the strip on every mutation it causes.
    const categoryId = Number(settings.critique_category_id);
    if (
      !activeForUrl(currentUrl) ||
      categoryListingCoolingOff(categoryId)
    ) {
      document.querySelector(STRIP_SELECTOR)?.remove();
      return;
    }

    const surface = categorySurface();
    if (!surface) {
      return;
    }

    let strip = document.querySelector(STRIP_SELECTOR);
    if (!strip) {
      strip = document.createElement("section");
      strip.className = "spc-needs-feedback";
      strip.dataset.spcNeedsFeedback = "";
      strip.setAttribute("aria-label", text("title"));
    }
    if (strip.parentElement !== surface) {
      surface.append(strip);
    }

    try {
      const data = await categoryListing(categoryId);
      if (!strip.isConnected) {
        return;
      }
      const markup = stripMarkup(data, Category.findById(categoryId));
      if (renderedMarkup !== markup || !strip.firstElementChild) {
        strip.innerHTML = markup;
        renderedMarkup = markup;
      }
    } catch {
      // No fallback copy: an empty strip would claim nothing needs feedback.
      strip.remove();
    }
  }

  // Rule 1: throttle on a timer, leading edge, never requestAnimationFrame.
  function scheduleRender() {
    if (renderQueued) {
      return;
    }
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      render();
    }, RENDER_THROTTLE_MS);
  }

  api.onPageChange((url) => {
    currentUrl = url;
    scheduleRender();
  });

  new MutationObserver(scheduleRender).observe(document.body, {
    childList: true,
    subtree: true,
  });

  scheduleRender();
});
