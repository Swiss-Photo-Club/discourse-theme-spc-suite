import { getOwnerWithFallback } from "discourse/lib/get-owner";
import { ajax } from "discourse/lib/ajax";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import {
  categorySurface,
  clearHero,
  renderHero,
  uploadUrl,
} from "../lib/spc-hero";

const COMPONENT_SELECTOR = "[data-spc-monthly-challenge]";
const RENDER_THROTTLE_MS = 200;
// Not a category id, so it can never collide with the category-hero registry
// and the two modules' marker-scoped clears stay disjoint.
const HERO_MARKER = "challenge";
const CACHE_TTL_MS = 5 * 60 * 1000;
const topicCache = new Map();

function translate(key, options = {}) {
  return i18n(themePrefix(`monthly_challenge.${key}`), options);
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value == null ? "" : String(value);
  return element.innerHTML;
}

function parseChallenges() {
  if (Array.isArray(settings.challenges)) {
    return settings.challenges;
  }

  if (typeof settings.challenges === "string") {
    try {
      const parsed = JSON.parse(settings.challenges);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function localeCode() {
  const locale = (document.documentElement.lang || "en").toLowerCase();
  if (locale.startsWith("de")) {
    return "de";
  }
  if (locale.startsWith("fr")) {
    return "fr";
  }
  return "en";
}

function localized(challenge, field) {
  const language = localeCode();
  return (
    challenge?.[`${field}_${language}`] ||
    challenge?.[`${field}_de`] ||
    challenge?.[`${field}_en`] ||
    challenge?.[`${field}_fr`] ||
    ""
  );
}

function legacyTopicContent(challenge) {
  const summary = localized(challenge, "summary");
  const tips = localized(challenge, "tips")
    .split(/\r?\n|\s*\|\s*/)
    .map((tip) => tip.trim())
    .filter(Boolean);
  const extra = localized(challenge, "extra");
  const content = [
    summary ? `<p>${escapeHtml(summary)}</p>` : "",
    tips.length
      ? `<h2>${escapeHtml(translate("tips_heading"))}</h2><ul>${tips
          .map((tip) => `<li>${escapeHtml(tip)}</li>`)
          .join("")}</ul>`
      : "",
    extra
      ? `<h2>${escapeHtml(translate("extra_heading"))}</h2><p>${escapeHtml(extra)}</p>`
      : "",
  ].join("");

  // The listing fields win over the settings registry and over the generic
  // label, because they are the live topic as Discourse itself renders it in
  // the category. They matter most to signed-out visitors: categories 6, 7 and
  // 8 are members-only, so /t/<id>.json answers 402 for them and this fallback
  // is the only path they ever take. Without the listing they saw "Monthly
  // challenge" and no summary; with it they see the real round.
  //
  // cooked stays empty on that path and the brief section stays unrendered,
  // which is correct - the post body is the part behind the paywall.
  return {
    id: Number(challenge?.topic_id) || 0,
    title:
      challenge?.listing?.title || localized(challenge, "title") || translate("label"),
    summary: summary || challenge?.listing?.excerpt || "",
    cooked: content,
    coverImage: challenge?.listing?.image || "",
    url: challenge?.topic_url || "",
    updatedAt: "legacy",
  };
}

function topicSummary(cooked) {
  if (!cooked) {
    return "";
  }

  const container = document.createElement("div");
  container.innerHTML = cooked;
  const paragraph = Array.from(container.querySelectorAll("p")).find(
    (element) => element.textContent.trim().length > 0
  );
  return paragraph?.textContent.trim() || "";
}

function topicCoverImage(cooked) {
  if (!cooked) {
    return "";
  }

  const container = document.createElement("div");
  container.innerHTML = cooked;
  return (
    Array.from(container.querySelectorAll("img")).find(
      (image) => !image.classList.contains("emoji") && !image.closest(".emoji")
    )?.getAttribute("src") || ""
  );
}

function topicUrl(data, challenge) {
  if (challenge?.topic_url) {
    return challenge.topic_url;
  }
  if (data?.post_stream?.posts?.[0]?.post_url) {
    return data.post_stream.posts[0].post_url;
  }
  if (data?.slug && data?.id) {
    return `/t/${encodeURIComponent(data.slug)}/${data.id}`;
  }
  return data?.id ? `/t/${data.id}` : "";
}

async function loadTopicContent(challenge) {
  const id = Number(challenge?.topic_id);
  if (!id) {
    return legacyTopicContent(challenge);
  }

  const cacheKey = `${id}-${localeCode()}`;
  if (!topicCache.has(cacheKey)) {
    topicCache.set(
      cacheKey,
      ajax(`/t/${id}.json`)
        .then((data) => {
          const firstPost = data?.post_stream?.posts?.find(
            (post) => Number(post.post_number) === 1
          );
          const cooked = firstPost?.cooked || "";
          return {
            id,
            title:
              data?.localized_title ||
              data?.localized_fancy_title ||
              data?.fancy_title ||
              data?.title ||
              translate("label"),
            summary: topicSummary(cooked),
            cooked,
            coverImage: topicCoverImage(cooked),
            url: topicUrl(data, challenge),
            updatedAt: firstPost?.updated_at || data?.last_posted_at || "",
          };
        })
        .catch((error) => {
          // 402 is not a failure. Categories 6, 7 and 8 are members-only, so
          // this is the paywall answering exactly as configured for every
          // signed-out visitor, on the busiest page in the forum. Logging it
          // as an error trained everyone to ignore this console.
          if (error?.jqXHR?.status === 402 || error?.status === 402) {
            return legacyTopicContent(challenge);
          }
          // The failure is deliberately left in the cache. Deleting the entry
          // here re-armed the fetch, and since renders are driven by a
          // MutationObserver on document.body, the next frame asked for the
          // topic again - a rate-limited response therefore produced a burst of
          // retries that kept the limiter tripped. The entry is cleared on page
          // change, so caching the fallback costs one stale render at worst.
          // eslint-disable-next-line no-console
          console.error("SPC Monthly Challenge: unable to load official topic", error);
          return legacyTopicContent(challenge);
        })
    );
  }

  return topicCache.get(cacheKey);
}

async function hydrateChallenge(challenge) {
  return {
    ...challenge,
    topic: await loadTopicContent(challenge),
  };
}

function challengeTitle(challenge) {
  return challenge?.topic?.title || localized(challenge, "title") || translate("label");
}

function challengeSummary(challenge) {
  return challenge?.topic?.summary || localized(challenge, "summary") || "";
}

function categoryDescription(category) {
  const value = category?.description || category?.description_excerpt;
  if (!value) {
    return "";
  }
  const container = document.createElement("div");
  container.innerHTML = value;
  return container.textContent.trim();
}

function categoryTopicUrl(category) {
  return (
    category?.topic_url || category?.topicUrl || settings.guide_topic_url || ""
  );
}

function validDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localizedDateFormat(options) {
  const locale = document.documentElement.lang || "en";
  const timeZone = settings.challenge_timezone || "Europe/Zurich";

  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat(locale, options);
  }
}

function formatDate(value) {
  const date = validDate(value);
  if (!date) {
    return "";
  }

  return localizedDateFormat({
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function monthLabel(challenge) {
  const date = validDate(challenge?.start_at);
  if (!date) {
    return "";
  }

  return localizedDateFormat({
    month: "long",
    year: "numeric",
  }).format(date);
}

// A round has two live phases and no dead one. Submissions close at the end of
// the month, but voting has no fixed deadline: it stays open until staff
// announce the winner and pin the next brief, at which point this round simply
// stops being the pinned one. There is deliberately no "closed" state — the
// current round is always either accepting photos or accepting votes, so the
// category never shows a dead end between rounds.
function challengeState(challenge) {
  if (challenge?.status === "archived") {
    return "archived";
  }

  const submissionDeadline = validDate(challenge?.submission_deadline)?.getTime();
  if (!submissionDeadline || Date.now() <= submissionDeadline) {
    return "submissions-open";
  }
  return "voting-open";
}

function categoryRoute() {
  return `/c/${Number(settings.monthly_category_id)}`;
}

function composerRoute(challenge) {
  const query = new URLSearchParams({
    category: String(settings.monthly_category_id),
    tags: challenge.tag,
  });
  return `/new-topic?${query.toString()}`;
}

function activeChallenge(challenges) {
  return challenges
    .filter((challenge) => challenge.status === "active")
    .sort((a, b) => (validDate(b.start_at)?.getTime() || 0) - (validDate(a.start_at)?.getTime() || 0))[0];
}

// --- Pinned-brief detection -------------------------------------------------
// The current challenge is defined by the staff workflow: post the challenge
// brief in the Monthly Challenge category, tag it with the round tag
// (YYYY-MM-theme) and pin it. The settings registry remains as an optional
// override (deadlines, winner, archive data), matched by tag.
// A topic's tags arrive as objects from the category listing - {id, name, slug}
// - and as bare strings elsewhere. Both shapes have to be read the same way,
// because reading one of them wrong fails silently: the brief is still found,
// its round tag comes back undefined, and everything quietly falls through to
// the settings registry instead.
// Exported for components/spc-challenge-admin.gjs, which must read round tags
// with exactly these semantics — the two disagreeing fails silently.
export function tagName(tag) {
  return typeof tag === "string" ? tag : tag?.name || "";
}

export function findRoundTag(tags) {
  return (tags || []).find((tag) => /^\d{4}-\d{2}/.test(tagName(tag)));
}

// A user-facing tag page URL. On current Discourse the HTML tag routes require
// the tag's NUMERIC id - /tag/<slug>/<id> - and the old name-based paths
// (/tag/<name>, /tags/c/<cat>/<id>/<name>) survive for json/rss formats only:
// as pages they 404. The id and slug ride along on the tag objects the topic
// listings serialize; when a listing hands us a bare string instead, the
// name-based URL is the only option left and current Discourse redirects it
// to the canonical form for browsers.
export function tagPageUrl(tag) {
  const name = tagName(tag);
  if (!name) {
    return "";
  }
  const id = typeof tag === "object" ? Number(tag?.id) || 0 : 0;
  const slug = (typeof tag === "object" && tag?.slug) || name;
  return id
    ? `/tag/${encodeURIComponent(slug)}/${id}`
    : `/tag/${encodeURIComponent(name)}`;
}

let pinnedBriefPromise = null;

export function clearPinnedBriefCache() {
  pinnedBriefPromise = null;
}

function fetchPinnedBrief() {
  pinnedBriefPromise ||= (async () => {
    try {
      const data = await ajax(`${categoryRoute()}/l/latest.json`);
      const topics = data?.topic_list?.topics || [];
      // topic.pinned is PER-USER: Discourse auto-unpins a pinned topic for
      // anyone who has read it to the bottom (a user preference, on by
      // default), and the listing then serves pinned:false to that reader -
      // so the staff member who just posted the brief is exactly who stops
      // seeing it as pinned. unpinned:true marks that per-user state, so
      // "pinned || unpinned" means pinned-for-the-site.
      //
      // Among pinned briefs, the newest round tag wins, so a not-yet-unpinned
      // previous brief cannot shadow the fresh one during the handover.
      const brief = topics
        .filter((topic) =>
          Boolean((topic.pinned || topic.unpinned) && findRoundTag(topic.tags))
        )
        .sort((a, b) =>
          tagName(findRoundTag(b.tags)).localeCompare(
            tagName(findRoundTag(a.tags))
          )
        )[0];
      if (!brief) {
        return null;
      }
      const roundTag = findRoundTag(brief.tags);
      return {
        topic_id: brief.id,
        topic_url: brief.slug
          ? `/t/${encodeURIComponent(brief.slug)}/${brief.id}`
          : `/t/${brief.id}`,
        tag: tagName(roundTag),
        tag_page_url: tagPageUrl(roundTag),
        // The category listing is public even where the topics behind it are
        // not, and it already carries everything the hero needs. Taking it
        // here costs nothing: this response was fetched anyway.
        // NOT fancy_title_localized - that is a boolean flag saying the title
        // HAS been localized, not the localized title. Reading it as a string
        // renders a hero headline of "true".
        //
        // The excerpt is trimmed to its first paragraph, which is what
        // topicSummary() does to the cooked post on the signed-in path, so the
        // two produce the same lead rather than merely similar ones.
        listing: {
          title: brief.fancy_title || brief.title || "",
          excerpt: (brief.excerpt || "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "",
          image: brief.image_url || "",
        },
      };
    } catch {
      return null;
    }
  })();
  return pinnedBriefPromise;
}

function deriveChallengeFromBrief(brief) {
  const match = /^(\d{4})-(\d{2})/.exec(brief.tag || "");
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");

  return {
    listing: brief.listing,
    topic_id: brief.topic_id,
    topic_url: brief.topic_url,
    tag: brief.tag,
    tag_page_url: brief.tag_page_url,
    status: "active",
    start_at: `${year}-${pad(month)}-01T00:00:00+02:00`,
    submission_deadline: `${year}-${pad(month)}-${pad(lastDay)}T23:59:00+02:00`,
    // Voting has no fixed deadline — see challengeState().
    voting_deadline: "",
    gallery_url: "",
    winner_title: "",
    winner_author: "",
    winner_topic_url: "",
    entry_count: 0,
  };
}

async function resolveActiveChallenge(challenges) {
  const brief = await fetchPinnedBrief();
  if (brief) {
    const derived = deriveChallengeFromBrief(brief);
    if (derived) {
      const override = challenges.find((c) => c.tag === brief.tag);
      return override
        ? {
            ...derived,
            ...override,
            listing: derived.listing,
            topic_id: Number(override.topic_id) || brief.topic_id,
            status: "active",
          }
        : derived;
    }
  }
  // Fallback: no pinned brief found — use the settings registry as before.
  return activeChallenge(challenges);
}

// --- Winner detection --------------------------------------------------------
// The previous winner is the newest topic in the category carrying the
// staff-only `winner` tag. Staff pick the winner by adding that tag to the
// winning entry — no settings edit, no re-upload. The topic's own round tag
// (YYYY-MM-theme) says which month it won; the category listing supplies
// title, photograph and author. A `challenges` registry entry matching the
// same round tag remains an optional override, and the registry-only path
// below keeps rounds recorded before the tag existed rendering.
export const WINNER_TAG = "winner";

let winnerPromise = null;

export function clearWinnerCache() {
  winnerPromise = null;
}

// JSON ONLY. The name-based category+tag route survives solely for json/rss
// formats on current Discourse; as an HTML page this path 404s. User-facing
// hrefs go through tagPageUrl() instead.
function tagListJsonUrl(tag) {
  return `/tags/c/${settings.monthly_category_slug}/${Number(
    settings.monthly_category_id
  )}/${encodeURIComponent(tag)}.json`;
}

function roundMonthLabel(tag) {
  const match = /^(\d{4})-(\d{2})/.exec(tag || "");
  if (!match) {
    return "";
  }
  return localizedDateFormat({ month: "long", year: "numeric" }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1)
  );
}

function roundThemeLabel(tag) {
  const suffix = (tag || "")
    .replace(/^\d{4}-\d{2}-?/, "")
    .replaceAll("-", " ")
    .trim();
  return suffix ? suffix.charAt(0).toUpperCase() + suffix.slice(1) : "";
}

function fetchWinnerTopic() {
  winnerPromise ||= (async () => {
    try {
      const data = await ajax(tagListJsonUrl(WINNER_TAG));
      const users = data?.users || [];
      const candidates = (data?.topic_list?.topics || [])
        .map((topic) => ({ topic, roundTag: findRoundTag(topic.tags) }))
        .filter((entry) => entry.roundTag)
        // Round tags sort chronologically as strings; newest round wins.
        .sort((a, b) =>
          tagName(b.roundTag).localeCompare(tagName(a.roundTag))
        );
      const latest = candidates[0];
      if (!latest) {
        return null;
      }
      const { topic, roundTag } = latest;
      const authorId =
        (topic.posters || []).find((poster) =>
          (poster.description || "").toLowerCase().includes("original")
        )?.user_id ?? topic.posters?.[0]?.user_id;
      const author = users.find((user) => user.id === authorId);
      return {
        tag: tagName(roundTag),
        tagPage: tagPageUrl(roundTag),
        title: topic.title || topic.fancy_title || "",
        author: author?.name || author?.username || "",
        image: topic.image_url || "",
        url: topic.slug
          ? `/t/${encodeURIComponent(topic.slug)}/${topic.id}`
          : `/t/${topic.id}`,
      };
    } catch {
      // Cached until the TTL expiry, same as the pinned brief — clearing on
      // failure would re-arm the fetch on the next observed mutation.
      return null;
    }
  })();
  return winnerPromise;
}

async function resolveLatestWinner(challenges) {
  const tagged = await fetchWinnerTopic();
  if (tagged) {
    const override = challenges.find((c) => c.tag === tagged.tag);
    return {
      tag: tagged.tag,
      month: roundMonthLabel(tagged.tag),
      theme: roundThemeLabel(tagged.tag),
      title: override?.winner_title || tagged.title,
      author: override?.winner_author || tagged.author,
      image: uploadUrl(override?.winner_image) || tagged.image,
      href: override?.gallery_url || tagged.url,
      entriesUrl: tagged.tagPage,
      entryCount: Number(override?.entry_count) || 0,
    };
  }

  // Registry-only fallback: the newest archived round, rendered only when
  // staff completed both the title and the image. Do not skip over an
  // incomplete record and accidentally label an older photograph as last
  // month's winner.
  const previous = archivedChallenges(challenges)[0];
  if (!previous?.winner_title || !uploadUrl(previous.winner_image)) {
    return null;
  }
  const hydrated = await hydrateChallenge(previous);
  return {
    tag: previous.tag,
    month: monthLabel(previous),
    theme: challengeTitle(hydrated),
    title: previous.winner_title,
    author: previous.winner_author || "",
    image: uploadUrl(previous.winner_image),
    href:
      previous.gallery_url ||
      previous.winner_topic_url ||
      hydrated.topic?.url ||
      categoryRoute(),
    // The registry stores the tag as a bare string, so this falls back to the
    // name-based URL, which browsers get redirected from.
    entriesUrl: previous.tag ? tagPageUrl(previous.tag) : "",
    entryCount: Number(previous.entry_count) || 0,
  };
}

// The URL, not the body class: Discourse stamps category-<slug> on the
// category listing AND on every topic inside it, so a class check rendered
// the hero, current-round card and winner section under each entry's post
// stream too. Only /c/... paths are the category page.
function isChallengePage() {
  return isChallengeCategoryUrl(window.location.href);
}

function isChallengeCategoryUrl(url) {
  const path = new URL(url, window.location.origin).pathname.replace(/\/+$/, "");
  const categoryId = Number(settings.monthly_category_id);
  const categorySlug = settings.monthly_category_slug;

  return (
    path === `/c/${categoryId}` ||
    path === `/c/${categorySlug}/${categoryId}` ||
    path.startsWith(`/c/${categorySlug}/${categoryId}/`)
  );
}

function findHomeCard() {
  // Legacy slot used only while the external Featured Categories component
  // remains active during migration.
  return document.querySelector(
    '[data-spc-monthly-challenge-slot="home"] > a'
  );
}

function ensureHomeCard() {
  if (!document.body.classList.contains("navigation-topics")) {
    return null;
  }

  // The local renderer outputs the administrator's category selection
  // verbatim. Homepage challenge content must not add or replace a category.
  if (settings.enable_local_featured_categories) {
    return null;
  }

  const existing = findHomeCard();
  if (existing) {
    return existing;
  }

  // Migration fallback for the external Featured Categories component. It
  // cannot reserve a special card, so retain the old prepended slot until the
  // local renderer is enabled and the external component is detached.
  const list = document.querySelector(".featured-categories__list-container");
  if (!list) {
    return null;
  }

  const container = document.createElement("div");
  container.className = "featured-categories__category-container";
  container.dataset.spcMonthlyChallengeSlot = "home";

  const card = document.createElement("a");
  card.className = "featured-categories__category-link";
  card.href = categoryRoute();
  container.append(card);
  list.prepend(container);

  return card;
}

function setHomeCardCover(card, challenge) {
  const cover = uploadUrl(challenge.cover_image) || challenge.topic?.coverImage;

  if (cover) {
    card.style.setProperty("--spc-challenge-cover", `url("${cover.replaceAll('"', "%22")}")`);
    card.classList.add("spc-monthly-card--with-cover");
  } else {
    card.style.removeProperty("--spc-challenge-cover");
    card.classList.remove("spc-monthly-card--with-cover");
  }
}

function prepareHomeCard(challenge) {
  const card = ensureHomeCard();
  if (!card || card.dataset.spcMonthlyChallenge === "home") {
    return;
  }

  const fallbackSummary = card.querySelector(".category-description")?.textContent?.trim() || "";
  const title = challengeTitle(challenge);
  const month = monthLabel(challenge);

  card.dataset.spcMonthlyChallenge = "loading";
  card.classList.add("spc-monthly-card", "spc-monthly-card--loading");
  card.href = categoryRoute();
  card.setAttribute("aria-busy", "true");
  card.setAttribute("aria-label", `${translate("current")}: ${title}`);
  card.innerHTML = `
    <span class="spc-monthly-card__content">
      <span class="spc-eyebrow">${escapeHtml(translate("current"))}${
        month ? ` · ${escapeHtml(month)}` : ""
      }</span>
      <strong class="spc-monthly-card__title">${escapeHtml(title)}</strong>
      ${
        fallbackSummary
          ? `<span class="spc-monthly-card__summary">${escapeHtml(fallbackSummary)}</span>`
          : ""
      }
    </span>
    <span class="spc-monthly-card__cta" aria-hidden="true">${escapeHtml(
      translate("label")
    )}</span>
  `;
  setHomeCardCover(card, challenge);
}

function renderHomeCard(challenge) {
  const card = ensureHomeCard();

  if (!card) {
    return;
  }

  const signature = `${challenge.tag}-${challenge.topic?.updatedAt}-${localeCode()}`;
  if (card.dataset.spcChallengeSignature === signature) {
    return;
  }

  const title = challengeTitle(challenge);
  const summary = challengeSummary(challenge);

  card.dataset.spcChallengeSignature = signature;
  card.dataset.spcMonthlyChallenge = "home";
  card.classList.add("spc-monthly-card");
  card.classList.remove("spc-monthly-card--loading");
  card.href = categoryRoute();
  card.removeAttribute("aria-busy");
  card.setAttribute("aria-label", `${translate("current")}: ${title}`);
  card.innerHTML = `
    <span class="spc-monthly-card__content">
      <span class="spc-eyebrow">${escapeHtml(translate("current"))} · ${escapeHtml(
        monthLabel(challenge)
      )}</span>
      <strong class="spc-monthly-card__title">${escapeHtml(title)}</strong>
      <span class="spc-monthly-card__summary">${escapeHtml(summary)}</span>
    </span>
    <span class="spc-monthly-card__cta" aria-hidden="true">${escapeHtml(
      translate("label")
    )}</span>
  `;

  setHomeCardCover(card, challenge);
}

function deadlineText(challenge, state) {
  if (state === "submissions-open" && challenge.submission_deadline) {
    return translate("open_deadlines", {
      date: formatDate(challenge.submission_deadline),
    });
  }
  if (state === "voting-open") {
    return translate("voting_until_winner");
  }
  return "";
}

// The hero is our own element inside SPC Suite's category surface. It used to
// overwrite a core node, and later used Category Banners' hidden
// `.category-title-header` as an insertion anchor. The former fought Ember on
// navigation; the latter made an invisible third-party component load-bearing.
// Owning both the element and its mount lets clearHero() simply delete it —
// see findHomeCard() for the same lesson.
//
// Both of those functions now live in lib/spc-hero.js, shared with the four
// category-specific overrides and the generic category fallback. This category
// is NOT gated by enable_category_hero or handled by the generic initializer,
// and must not be: the hero is part of the route-map, permalink and
// route:new-topic stack behind /submit, and a half-enabled state breaks photo
// submission. Sharing the renderer is not sharing a lifecycle.
function renderChallengeHero(challenge, currentUser) {
  const state = challengeState(challenge);
  const isOpen = challenge.status === "active" && state === "submissions-open";
  const category = Category.findById(Number(settings.monthly_category_id));
  const cover = uploadUrl(category?.uploaded_background);
  const description = categoryDescription(category);
  const topicUrl = categoryTopicUrl(category);
  const currentTitle = challengeTitle(challenge);
  // Staff-only shortcut: this round's entries ranked by Topic Voting count,
  // so picking the winner is one look and one tag. tag_page_url carries the
  // tag's numeric id from the pinned brief's listing; the bare tag name is
  // the redirect-dependent fallback for the registry-only path.
  const staffTagPage =
    challenge.tag_page_url || (challenge.tag ? tagPageUrl(challenge.tag) : "");
  const staffVotesUrl =
    currentUser?.staff && staffTagPage ? `${staffTagPage}?order=votes` : "";

  renderHero({
    marker: HERO_MARKER,
    variant: "challenge",
    signature: [
      challenge.tag,
      challenge.topic?.updatedAt,
      state,
      localeCode(),
      category?.name,
      currentTitle,
      cover,
      description,
      topicUrl,
      staffVotesUrl,
    ].join("-"),
    eyebrow: monthLabel(challenge),
    title: category?.name || translate("label"),
    lead: translate("current_theme", { title: currentTitle }),
    meta: deadlineText(challenge, state),
    introduction: {
      body: description,
      href: topicUrl,
      label: translate("read_more_category"),
    },
    cover,
    shade: true,
    actions: [
      // Open: a <button> the capture-phase handler in spc-photo-submit.js
      // intercepts and routes to /submit. Closed: a plain anchor down to the
      // entry grid. The data attribute is what distinguishes them, and it is
      // reproduced here verbatim.
      isOpen
        ? {
            label: translate("submit_photo"),
            style: "primary",
            attribute: "data-spc-submit-photo",
          }
        : {
            label: translate("view_entries"),
            href: "#list-area",
            style: "primary",
          },
      {
        label: translate("how_voting_works"),
        style: "secondary",
        attribute: "data-spc-open-voting",
      },
      staffVotesUrl
        ? {
            label: translate("entries_by_votes"),
            href: staffVotesUrl,
            style: "secondary",
          }
        : null,
    ],
  });
}

function renderCurrentChallenge(challenge) {
  const existing = document.querySelector(".spc-challenge-current");
  const title = challengeTitle(challenge);
  const summary = challengeSummary(challenge);
  const image = uploadUrl(challenge.cover_image) || challenge.topic?.coverImage;
  const href =
    challenge.topic?.url || challenge.topic_url || settings.guide_topic_url;
  const signature = [
    challenge.tag,
    challenge.topic?.updatedAt,
    localeCode(),
    title,
    summary,
    image,
    href,
  ].join("-");

  if (existing?.dataset.spcChallengeSignature === signature) {
    return;
  }

  existing?.remove();
  const section = document.createElement("section");
  section.className = "spc-challenge-current";
  section.dataset.spcMonthlyChallenge = "current";
  section.dataset.spcChallengeSignature = signature;
  section.setAttribute("aria-labelledby", "spc-challenge-current-title");
  section.innerHTML = `
    <div class="spc-challenge-current__media">
      ${image ? `<img src="${escapeHtml(image)}" alt="">` : ""}
    </div>
    <div class="spc-challenge-current__content">
      <span class="spc-eyebrow">${escapeHtml(translate("current"))}</span>
      <h2 id="spc-challenge-current-title">${escapeHtml(title)}</h2>
      ${summary ? `<p>${escapeHtml(summary)}</p>` : ""}
    </div>
    ${
      href
        ? `<a class="spc-challenge-current__link" href="${escapeHtml(
            href
          )}">${escapeHtml(translate("read_full_challenge"))} →</a>`
        : ""
    }
  `;

  categorySurface()?.append(section);
}

function archivedChallenges(challenges) {
  return challenges
    .filter((challenge) => challenge.status === "archived")
    .sort((a, b) => (validDate(b.start_at)?.getTime() || 0) - (validDate(a.start_at)?.getTime() || 0));
}

function renderPreviousWinner(winner) {
  const existing = document.querySelector(".spc-challenge-winner");

  // Incomplete data shows nothing rather than something wrong: the section
  // waits for a winner-tagged topic with a photograph (or a completed
  // registry record) instead of guessing.
  if (!winner?.title || !winner.image) {
    existing?.remove();
    return;
  }

  const eyebrow = winner.theme
    ? translate("last_month_winner", { month: winner.month, theme: winner.theme })
    : translate("last_month_winner_plain", { month: winner.month });
  const meta = [
    winner.author ? translate("by_author", { author: winner.author }) : "",
    winner.entryCount > 0
      ? translate("entries", { count: winner.entryCount })
      : "",
  ].filter(Boolean);
  const signature = [
    winner.tag,
    localeCode(),
    winner.title,
    winner.author,
    winner.entryCount,
    winner.image,
    winner.href,
    winner.entriesUrl,
  ].join("-");

  if (existing?.dataset.spcChallengeSignature === signature) {
    return;
  }

  existing?.remove();
  const section = document.createElement("section");
  section.className = "spc-challenge-winner";
  section.dataset.spcMonthlyChallenge = "winner";
  section.dataset.spcChallengeSignature = signature;
  section.setAttribute("aria-labelledby", "spc-challenge-winner-title");
  section.innerHTML = `
    <div class="spc-challenge-winner__media">
      <img src="${escapeHtml(winner.image)}" alt="${escapeHtml(winner.title)}">
    </div>
    <div class="spc-challenge-winner__content">
      <span class="spc-eyebrow">${escapeHtml(eyebrow)}</span>
      <h2 id="spc-challenge-winner-title">${escapeHtml(winner.title)}</h2>
      ${meta.length ? `<p>${escapeHtml(meta.join(" · "))}</p>` : ""}
      ${
        winner.href
          ? `<a href="${escapeHtml(winner.href)}">${escapeHtml(
              translate("winning_photo")
            )} →</a>`
          : ""
      }
      ${
        winner.entriesUrl
          ? `<a href="${escapeHtml(winner.entriesUrl)}">${escapeHtml(
              translate("previous_entries", { month: winner.month })
            )} →</a>`
          : ""
      }
    </div>
  `;

  categorySurface()?.append(section);
}

function hideOfficialTopicRow(challenge) {
  document
    .querySelectorAll(".spc-challenge-official-topic-row")
    .forEach((row) => row.classList.remove("spc-challenge-official-topic-row"));

  const topicId = Number(challenge?.topic_id);
  if (!topicId) {
    return;
  }

  document
    .querySelectorAll(
      `.topic-list-item[data-topic-id="${topicId}"], tr[data-topic-id="${topicId}"]`
    )
    .forEach((row) => row.classList.add("spc-challenge-official-topic-row"));
}

function renderComposer(challenge, composerService) {
  const composer = document.querySelector("#reply-control.open");
  if (
    !composer ||
    challenge.status !== "active" ||
    challengeState(challenge) !== "submissions-open"
  ) {
    return;
  }

  const modelTags = composerService?.model?.tags || [];
  const hasChallengeTag =
    modelTags.includes?.(challenge.tag) ||
    Array.from(composer.querySelectorAll(".tags-input summary")).some(
      (tag) => tag.dataset.name === challenge.tag || tag.textContent.trim() === challenge.tag
    );
  if (!hasChallengeTag) {
    return;
  }

  const signature = `${challenge.tag}-${challenge.topic?.updatedAt}-${localeCode()}`;
  composer.classList.add("spc-monthly-composer");
  if (composer.dataset.spcChallengeSignature !== signature) {
    composer.querySelector(".spc-composer-challenge")?.remove();
    const callout = document.createElement("div");
    callout.className = "spc-composer-challenge";
    callout.dataset.spcMonthlyChallenge = "composer";
    callout.innerHTML = `
      <span class="spc-eyebrow">${escapeHtml(translate("current"))}</span>
      <strong>${escapeHtml(challengeTitle(challenge))}</strong>
      ${
        challengeSummary(challenge)
          ? `<p>${escapeHtml(challengeSummary(challenge))}</p>`
          : ""
      }
      ${
        challenge.topic?.url
          ? `<a href="${escapeHtml(challenge.topic.url)}">${escapeHtml(
              translate("read_full_challenge")
            )} →</a>`
          : ""
      }
    `;
    composer.querySelector(".title-and-category")?.before(callout);
    composer.dataset.spcChallengeSignature = signature;
  }

  const formWrapper = composer.querySelector(".form-template-form__wrapper");
  if (formWrapper) {
    let photoIntro = formWrapper.querySelector(".spc-composer-photo-intro");
    if (!photoIntro) {
      photoIntro = document.createElement("div");
      photoIntro.className = "spc-composer-photo-intro";
      formWrapper.prepend(photoIntro);
    }
    photoIntro.innerHTML = `
      <strong>${escapeHtml(translate("your_photo"))}</strong>
      <p>${escapeHtml(translate("upload_hint"))}</p>
    `;

    const uploadLabel = formWrapper.querySelector(".form-template-field__label");
    if (uploadLabel) {
      uploadLabel.textContent = translate("your_photo");
    }
  }

  const titleInput = composer.querySelector("#reply-title");
  if (titleInput) {
    titleInput.placeholder = translate("photo_title_placeholder");
    titleInput.setAttribute("aria-label", translate("photo_title"));
  }

  const actionLabel = composer.querySelector(".composer-actions-trigger .d-button-label");
  const submitLabel = composer.querySelector(".save-or-cancel .create .d-button-label");
  if (actionLabel && actionLabel.textContent !== translate("submit_photo")) {
    actionLabel.textContent = translate("submit_photo");
  }
  if (submitLabel && submitLabel.textContent !== translate("submit_photo")) {
    submitLabel.textContent = translate("submit_photo");
  }
}

function ensureVotingDialog() {
  const signature = localeCode();
  let dialog = document.querySelector("#spc-voting-dialog");
  if (dialog?.dataset.spcChallengeSignature === signature) {
    return dialog;
  }

  dialog?.remove();
  dialog = document.createElement("dialog");
  dialog.id = "spc-voting-dialog";
  dialog.className = "spc-voting-dialog";
  dialog.dataset.spcMonthlyChallenge = "voting-dialog";
  dialog.dataset.spcChallengeSignature = signature;
  dialog.innerHTML = `
    <form method="dialog" class="spc-voting-dialog__panel">
      <button class="spc-voting-dialog__close" value="close" aria-label="${escapeHtml(
        translate("close")
      )}">×</button>
      <span class="spc-eyebrow">${escapeHtml(translate("label"))}</span>
      <h2>${escapeHtml(translate("vote_modal_title"))}</h2>
      <ol class="spc-voting-dialog__steps">
        <li><span>1</span><div><strong>${escapeHtml(
          translate("vote_step_one_title")
        )}</strong><p>${escapeHtml(translate("vote_step_one_body"))}</p></div></li>
        <li><span>2</span><div><strong>${escapeHtml(
          translate("vote_step_two_title")
        )}</strong><p>${escapeHtml(translate("vote_step_two_body"))}</p></div></li>
        <li><span>3</span><div><strong>${escapeHtml(
          translate("vote_step_three_title")
        )}</strong><p>${escapeHtml(translate("vote_step_three_body"))}</p></div></li>
      </ol>
      <a class="spc-voting-dialog__guide" href="${escapeHtml(settings.guide_topic_url)}">${escapeHtml(
        translate("full_rules")
      )} →</a>
    </form>
  `;
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
  document.body.append(dialog);
  return dialog;
}

function repairLegacyCategoryLinks() {
  const brokenPrefix = `/tags/c/${settings.monthly_category_slug}/`;

  document.querySelectorAll("a[href]").forEach((link) => {
    // [data-spc-hero] as well as our own components: the hero used to carry
    // data-spc-monthly-challenge and was skipped by that first clause, and it
    // is now marked as a hero instead. None of its links match the broken
    // prefix today, but the exclusion was deliberate and is cheap to keep.
    if (link.closest(COMPONENT_SELECTOR) || link.closest("[data-spc-hero]")) {
      return;
    }
    const pathname = new URL(link.href, window.location.origin).pathname;
    if (pathname.startsWith(brokenPrefix)) {
      link.href = categoryRoute();
    }
  });
}

let spcStarted = false;

function spcStartWhenReady(passedOwner, run) {
  const tryStart = () => {
    if (spcStarted) {
      return true;
    }
    let api = null;
    try {
      api = passedOwner?.lookup?.("plugin-api:main") || null;
    } catch {}
    if (!api) {
      try {
        const owner = getOwnerWithFallback(
          document.querySelector("#main-outlet") || document.body
        );
        api = owner?.lookup?.("plugin-api:main") || null;
      } catch {}
    }
    if (!api) {
      return false;
    }
    spcStarted = true;
    try {
      run(api);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[SPC]", e);
    }
    return true;
  };

  if (tryStart()) {
    return;
  }

  let attempts = 0;
  const retry = () => {
    if (!tryStart() && attempts++ < 20) {
      setTimeout(retry, 500);
    }
  };
  if (document.readyState === "complete") {
    setTimeout(retry, 0);
  } else {
    window.addEventListener("load", () => setTimeout(retry, 0), { once: true });
  }
}

const spcRun = (api) => {
  const composerService = api.container.lookup("service:composer");
  const currentUser = api.getCurrentUser();
  let renderQueued = false;
  let renderRequest = 0;
  let currentActive = null;

  // Every page that does not show challenge content anywhere. render() used to
  // await the pinned brief and the challenge topic before it checked, so simply
  // reading Meetups or Announcements fetched two challenge endpoints it had no
  // use for - and when those were the requests that tripped the rate limiter,
  // the unrelated category the reader was actually on failed to load with it.
  function needsChallengeData() {
    return (
      isChallengePage() ||
      // The legacy external component still needs its injected homepage card.
      (!settings.enable_local_featured_categories &&
        document.body.classList.contains("navigation-topics")) ||
      // renderComposer() prefills the round tag, but only while it is open.
      Boolean(document.querySelector("#reply-control.open"))
    );
  }

  function clearChallengeSections() {
    clearHero(HERO_MARKER);
    document
      .querySelectorAll(
        ".spc-challenge-brief, .spc-challenge-education, .spc-challenge-archive, .spc-challenge-current, .spc-challenge-winner"
      )
      .forEach((element) => element.remove());
  }

  async function render() {
    const request = ++renderRequest;

    // Needs no challenge data, so it runs before the gate below.
    repairLegacyCategoryLinks();

    if (!needsChallengeData()) {
      clearChallengeSections();
      return;
    }

    const challenges = parseChallenges();
    const activeRecord = await resolveActiveChallenge(challenges);
    if (request !== renderRequest || !activeRecord) {
      return;
    }

    if (!settings.enable_local_featured_categories) {
      prepareHomeCard(activeRecord);
    }

    const active = await hydrateChallenge(activeRecord);
    if (request !== renderRequest) {
      return;
    }
    currentActive = active;

    renderHomeCard(active);
    renderComposer(active, composerService);
    ensureVotingDialog();

    if (!isChallengePage()) {
      clearChallengeSections();
      return;
    }

    // The category template shows only the latest winner. One tag-listing
    // request resolves it (cached, TTL-expired) instead of fetching every
    // historical challenge topic on each visit to the category.
    const winner = await resolveLatestWinner(challenges);
    if (request !== renderRequest) {
      return;
    }

    renderChallengeHero(active, currentUser);
    renderCurrentChallenge(active);
    renderPreviousWinner(winner);
    hideOfficialTopicRow(active);
  }

  // Throttled on a timer rather than requestAnimationFrame. The observer at the
  // bottom of this file watches all of document.body and every render mutates
  // the DOM, so a frame's worth of debouncing allowed up to sixty renders a
  // second, each one feeding the observer that scheduled the next. Leading-edge
  // scheduling (rather than extending the wait on each mutation) means a page
  // that never stops mutating still gets rendered.
  function scheduleRender() {
    if (renderQueued) {
      return;
    }
    renderQueued = true;
    setTimeout(() => {
      renderQueued = false;
      render().catch((error) => {
        // eslint-disable-next-line no-console
        console.error("SPC Monthly Challenge: rendering failed", error);
      });
    }, RENDER_THROTTLE_MS);
  }

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-spc-submit-photo]")) {
      const active = currentActive;
      if (!active) {
        return;
      }

      const category = Category.findById(Number(settings.monthly_category_id));
      if (composerService?.openNewTopic && category) {
        try {
          await composerService.openNewTopic({
            category,
            tags: active.tag,
          });
          scheduleRender();
          return;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error("SPC Monthly Challenge: unable to open composer", error);
        }
      }

      window.location.assign(composerRoute(active));
      return;
    }

    if (!event.target.closest("[data-spc-open-voting]")) {
      return;
    }
    const dialog = ensureVotingDialog();
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  });

  // The brief and the challenge topic change about once a month, so the caches
  // are dropped when they go stale rather than on every navigation. Clearing
  // them per page change meant a fresh /c/<id>/l/latest.json and /t/<id>.json
  // for every click anywhere in the forum, which is most of the traffic this
  // component was generating.
  let cachesFilledAt = Date.now();

  function expireStaleCaches() {
    if (Date.now() - cachesFilledAt < CACHE_TTL_MS) {
      return;
    }
    cachesFilledAt = Date.now();
    topicCache.clear();
    clearPinnedBriefCache();
    clearWinnerCache();
  }

  api.onPageChange((url) => {
    expireStaleCaches();

    // Route cleanup must not wait behind a challenge fetch already in flight.
    // Invalidate that render and remove category-only content synchronously,
    // otherwise the brief can remain visible for a moment after navigating to
    // another category even though the shared hero has already switched.
    if (!isChallengeCategoryUrl(url)) {
      renderRequest += 1;
      clearChallengeSections();
    }

    scheduleRender();
  });
  new MutationObserver(scheduleRender).observe(document.body, {
    childList: true,
    subtree: true,
  });
  scheduleRender();
};

spcStartWhenReady(null, spcRun);

export default {
  name: "spc-monthly-challenge",
  after: "inject-objects",
  initialize(passedOwner) {
    spcStartWhenReady(passedOwner, spcRun);
  },
};
