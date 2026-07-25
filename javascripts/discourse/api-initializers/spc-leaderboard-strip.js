import { apiInitializer } from "discourse/lib/api";
import { ajax } from "discourse/lib/ajax";
import Category from "discourse/models/category";

const ACTIVE_CLASS = "spc-leaderboard-strip-active";
const STRIP_SELECTOR = "[data-spc-leaderboard-strip]";
const MAX_LEADERS = 5;

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
  let cachedData;
  const renderedMarkup = new WeakMap();

  async function leaderboardData() {
    const id = Number(settings.leaderboard_id) || 1;
    if (cachedLeaderboardId !== id || !cachedData) {
      cachedLeaderboardId = id;
      cachedData = await ajax(`/leaderboard/${id}.json`);
    }
    return cachedData;
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
    if (!listArea || !row) {
      removeStrip();
      return;
    }

    document.body.classList.add(ACTIVE_CLASS);

    let strip = row.querySelector(STRIP_SELECTOR);
    if (!strip) {
      strip = document.createElement("section");
      strip.className = "spc-leaderboard-strip";
      strip.dataset.spcLeaderboardStrip = "";
      strip.setAttribute("aria-label", "Leaderboard");
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
      strip.innerHTML = `<a class="spc-leaderboard-strip__fallback" href="/leaderboard/${id}">Leaderboard →</a>`;
      // eslint-disable-next-line no-console
      console.error("SPC Leaderboard Strip: unable to load leaderboard", error);
    }
  }

  function scheduleRender() {
    if (renderQueued) {
      return;
    }
    renderQueued = true;
    window.requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
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
