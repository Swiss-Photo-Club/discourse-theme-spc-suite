import { apiInitializer } from "discourse/lib/api";
import { ajax } from "discourse/lib/ajax";
import Category from "discourse/models/category";

const ACTIVE_CLASS = "spc-leaderboard-strip-active";
const STRIP_SELECTOR = "[data-spc-leaderboard-strip]";
const MAX_LEADERS = 5;
const RENDER_THROTTLE_MS = 200;
const FAILURE_COOL_OFF_MS = 60000;

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value == null ? "" : String(value);
  return element.innerHTML;
}

function selectedCategoryIds() {
  const value = settings.leaderboard_enabled_categories;
  const values = Array.isArray(value)
    ? value
    : String(value || "").split("|");

  return values.map(Number).filter((id) => Number.isInteger(id) && id > 0);
}

function selectedCategoryIsActive() {
  return selectedCategoryIds().some((id) => {
    const category = Category.findById(id);
    return Boolean(
      category?.slug &&
        document.body.classList.contains(`category-${category.slug}`)
    );
  });
}

function activeForUrl(url) {
  const path = new URL(url || window.location.href, window.location.origin)
    .pathname;

  return (
    (settings.leaderboard_show_on_homepage && path === "/") ||
    selectedCategoryIsActive()
  );
}

function leaderCount() {
  const count = Number(settings.leaderboard_leader_count) || 3;
  return Math.max(1, Math.min(MAX_LEADERS, count));
}

function avatarUrl(template) {
  const path = String(template || "").replace("{size}", "64");
  if (!path || /^https?:\/\//.test(path)) {
    return path;
  }
  return `${window.location.origin}${path}`;
}

function rankLabel(position) {
  return Number(position) === 1 ? "♛" : escapeHtml(position);
}

function userMarkup(user) {
  const username = String(user?.username || "");
  const name = user?.name || username;
  const position = Number(user?.position) || 0;
  const profileUrl = `/u/${encodeURIComponent(username)}`;
  const avatar = avatarUrl(user?.avatar_template);

  return `
    <a class="spc-leaderboard-strip__user" href="${profileUrl}" data-user-card="${escapeHtml(
      username
    )}">
      <span class="spc-leaderboard-strip__rank${
        position === 1 ? " -winner" : ""
      }" aria-label="Rank ${position}">${rankLabel(position)}</span>
      <span class="spc-leaderboard-strip__identity">
        <img class="spc-leaderboard-strip__avatar" src="${escapeHtml(
          avatar
        )}" alt="" loading="lazy" width="28" height="28">
        <span class="spc-leaderboard-strip__name">${escapeHtml(name)}</span>
      </span>
      <span class="spc-leaderboard-strip__score">${escapeHtml(
        user?.total_score
      )}</span>
    </a>`;
}

function stripMarkup(data) {
  const id = Number(settings.leaderboard_id) || 1;
  const title = data?.leaderboard?.name || "Leaderboard";
  const users = Array.isArray(data?.users)
    ? data.users.slice(0, leaderCount())
    : [];

  return `
    <div class="spc-leaderboard-strip__inner">
      <div class="spc-leaderboard-strip__heading">
        <a class="spc-leaderboard-strip__heading-link" href="/leaderboard/${id}">
          <h3 class="spc-leaderboard-strip__title">${escapeHtml(title)}</h3>
          <span class="spc-leaderboard-strip__arrow" aria-hidden="true">→</span>
        </a>
      </div>
      ${users.map(userMarkup).join("")}
    </div>`;
}

export default apiInitializer("1.8.0", (api) => {
  if (!settings.enable_leaderboard) {
    return;
  }

  let currentUrl = window.location.href;
  let renderQueued = false;
  let requestNumber = 0;
  let cachedLeaderboardId;
  let cachedRequest;
  let coolOffUntil = 0;
  const renderedMarkup = new WeakMap();

  // Cache the *promise*, not the value it resolves to. Assigning after the
  // await meant that every render starting while a request was still in flight
  // saw an empty cache and fired its own /leaderboard/<id>.json. Renders are
  // driven by a MutationObserver on document.body, so that was easily enough to
  // trip Discourse's rate limiter - and a 429 comes back with a plain-text body
  // that the ajax error handler tries to JSON.parse, which is why the symptom
  // was a bare "429 error" dialog with no message in it.
  function leaderboardData() {
    const id = Number(settings.leaderboard_id) || 1;

    if (cachedLeaderboardId !== id) {
      cachedLeaderboardId = id;
      cachedRequest = null;
    }

    if (!cachedRequest) {
      if (Date.now() < coolOffUntil) {
        return Promise.reject(new Error("leaderboard fetch is cooling off"));
      }

      cachedRequest = ajax(`/leaderboard/${id}.json`).catch((error) => {
        // Clear the cache so a later render can try again, but not before the
        // cool-off expires. Re-arming immediately is what turned a single
        // rate-limited response into a retry on the very next frame, which kept
        // the limiter tripped and the storm alive.
        cachedRequest = null;
        coolOffUntil = Date.now() + FAILURE_COOL_OFF_MS;
        throw error;
      });
    }

    return cachedRequest;
  }

  function removeStrip() {
    document.querySelector(STRIP_SELECTOR)?.remove();
    document.body.classList.remove(ACTIVE_CLASS);
  }

  async function render() {
    if (!activeForUrl(currentUrl)) {
      removeStrip();
      return;
    }

    const listArea = document.querySelector("#list-area");
    const row = listArea?.closest(".row.full-width");
    const categorySurface = document.querySelector(
      "[data-spc-category-surface]"
    );
    const useCategorySurface =
      document.body.classList.contains("navigation-category") &&
      selectedCategoryIsActive();
    if (!listArea || !row || (useCategorySurface && !categorySurface)) {
      removeStrip();
      return;
    }

    document.body.classList.add(ACTIVE_CLASS);

    let strip = document.querySelector(STRIP_SELECTOR);
    if (!strip) {
      strip = document.createElement("section");
      strip.className = "spc-leaderboard-strip";
      strip.dataset.spcLeaderboardStrip = "";
      strip.setAttribute("aria-label", "Leaderboard");
    }

    if (useCategorySurface) {
      if (strip.parentElement !== categorySurface) {
        categorySurface.append(strip);
      }
    } else if (
      strip.parentElement !== row ||
      strip.nextElementSibling !== listArea
    ) {
      row.insertBefore(strip, listArea);
    }

    strip.style.setProperty("--spc-leader-count", leaderCount());
    const request = ++requestNumber;

    try {
      const data = await leaderboardData();
      if (request !== requestNumber || !strip.isConnected) {
        return;
      }
      const markup = stripMarkup(data);
      if (renderedMarkup.get(strip) !== markup) {
        strip.innerHTML = markup;
        renderedMarkup.set(strip, markup);
      }
    } catch (error) {
      if (request !== requestNumber || !strip.isConnected) {
        return;
      }
      const id = Number(settings.leaderboard_id) || 1;
      const markup = `<a class="spc-leaderboard-strip__fallback" href="/leaderboard/${id}">Leaderboard →</a>`;
      if (renderedMarkup.get(strip) === markup) {
        return;
      }
      strip.innerHTML = markup;
      renderedMarkup.set(strip, markup);
      // Logged only when the fallback actually goes in, so a strip that stays
      // failed does not fill the console with one line per render.
      // eslint-disable-next-line no-console
      console.error("SPC Leaderboard Strip: unable to load leaderboard", error);
    }
  }

  // Throttled on a timer rather than requestAnimationFrame. The observer below
  // watches all of document.body and every render mutates the DOM, so a frame's
  // worth of debouncing allowed up to sixty renders a second, each one feeding
  // the observer that scheduled the next. Collapsing a burst into one render
  // every RENDER_THROTTLE_MS is what keeps the request count sane; leading-edge
  // scheduling (rather than extending the wait on each mutation) means a page
  // that never stops mutating still gets rendered.
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
