import { apiInitializer } from "discourse/lib/api";
import { ajax } from "discourse/lib/ajax";
import { relativeAge } from "discourse/lib/formatter";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import { categorySurface } from "../lib/spc-hero";

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
const FAILURE_COOL_OFF_MS = 60000;
const CACHE_TTL_MS = 5 * 60 * 1000;

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

// The smallest generated thumbnail that still fills a ~200px card on a 2x
// screen; the original upload is the fallback.
function thumbnailUrl(topic) {
  const thumbnail = (topic.thumbnails || [])
    .filter((entry) => entry.width >= 400)
    .sort((a, b) => a.width - b.width)[0];
  return thumbnail?.url || topic.image_url;
}

function authorName(topic, usersById) {
  const user = usersById.get(topic.posters?.[0]?.user_id);
  return user?.name || user?.username || "";
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

// relativeAge() returns markup (<span class="date" title=…>), and the card is
// escaped as text, so take its text content.
function postedAge(topic) {
  const element = document.createElement("span");
  element.innerHTML = relativeAge(new Date(topic.created_at), {
    format: "medium-with-ago",
  });
  return element.textContent;
}

function cardMarkup(topic, usersById) {
  const by = [authorName(topic, usersById), postedAge(topic)]
    .filter(Boolean)
    .join(" · ");

  return `
    <a class="spc-needs-feedback__card" href="/t/${escapeHtml(
      topic.slug
    )}/${Number(topic.id)}">
      <img src="${escapeHtml(thumbnailUrl(topic))}" alt="" loading="lazy">
      <span class="spc-needs-feedback__title">${escapeHtml(topic.title)}</span>
      <span class="spc-needs-feedback__by">${escapeHtml(by)}</span>
    </a>`;
}

function stripMarkup(data, category) {
  const topics = waitingTopics(data, category);
  const usersById = new Map(
    (data?.users || []).map((user) => [user.id, user])
  );

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
  let cachedRequest = null;
  let cachedAt = 0;
  let coolOffUntil = 0;
  let renderedMarkup = null;

  // Rule 2: cache the promise. Rule 5: expire it on a TTL, not per page.
  // Rule 3: a failure clears it only behind a cool-off.
  function listing(categoryId) {
    if (cachedRequest && Date.now() - cachedAt > CACHE_TTL_MS) {
      cachedRequest = null;
    }
    if (!cachedRequest) {
      if (Date.now() < coolOffUntil) {
        return Promise.reject(new Error("needs-feedback fetch is cooling off"));
      }
      cachedAt = Date.now();
      // One page of the category, newest first: it holds the recent
      // unanswered photos whatever the category's own default sort is.
      cachedRequest = ajax(`/c/${categoryId}/l/latest.json`, {
        data: { order: "created" },
      }).catch((error) => {
        cachedRequest = null;
        coolOffUntil = Date.now() + FAILURE_COOL_OFF_MS;
        // eslint-disable-next-line no-console
        console.error("SPC Needs Feedback: unable to load listing", error);
        throw error;
      });
    }
    return cachedRequest;
  }

  async function render() {
    // Cooling off counts as inactive, so a failed fetch does not keep
    // re-creating and removing the strip on every mutation it causes.
    if (
      !activeForUrl(currentUrl) ||
      (!cachedRequest && Date.now() < coolOffUntil)
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

    const categoryId = Number(settings.critique_category_id);
    try {
      const data = await listing(categoryId);
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
