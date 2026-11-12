import { apiInitializer } from "discourse/lib/api";
import { ajax } from "discourse/lib/ajax";
import DiscourseURL from "discourse/lib/url";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import {
  categorySurface,
  clearHero,
  ensureHero,
  uploadUrl,
} from "../lib/spc-hero";
import { currentMonthYM } from "../lib/spc-submit-helpers";

const COMPONENT_SELECTOR = "[data-spc-monthly-challenge]";
const RENDER_THROTTLE_MS = 200;
// Not a category id, so it can never collide with the category-hero registry
// and the two modules' marker-scoped clears stay disjoint.
const HERO_MARKER = "challenge";
const CACHE_TTL_MS = 5 * 60 * 1000;
// The switcher shows the newest rounds (plus the one being viewed); older
// rounds are one click away under "All rounds". Each shown round costs one
// per_page=1 listing for its brief title, so this also caps the requests.
const SWITCHER_ROUNDS = 3;
// A round listing is 30 topics a page. Ten pages is far beyond any round so
// far (September, the largest, is two) and stops a runaway loop.
const MAX_ROUND_PAGES = 10;
const topicCache = new Map();
const roundBriefCache = new Map();
const roundEntriesCache = new Map();

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

// A round is a calendar month. Anchor it away from timezone/DST boundaries.
function roundDate(tag) {
  const match = /^(\d{4})-(\d{2})/.exec(tag || "");
  return match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 15, 12))
    : null;
}

function monthLabel(challenge) {
  const date = roundDate(challenge?.tag) || validDate(challenge?.start_at);
  if (!date) {
    return "";
  }

  return localizedDateFormat({
    month: "long",
    year: "numeric",
  }).format(date);
}

// The server closes completed rounds and returns their voting allowance when
// the next brief is pinned, or at month rollover in the challenge timezone.
function challengeState(challenge) {
  if (challenge?.status === "archived") {
    return "archived";
  }

  const roundMonth = /^(\d{4}-\d{2})(?:-|$)/.exec(challenge?.tag || "")?.[1];
  if (roundMonth && roundMonth < currentMonthYM()) {
    return "closed";
  }

  const submissionDeadline = validDate(challenge?.submission_deadline)?.getTime();
  if (!submissionDeadline || Date.now() <= submissionDeadline) {
    return "submissions-open";
  }
  return "closed";
}

function categoryRoute() {
  return `/c/${Number(settings.challenge_category_id)}`;
}

function composerRoute(challenge) {
  const query = new URLSearchParams({
    category: String(settings.challenge_category_id),
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

// Localized tags expose their translated label as `name` but retain the
// canonical, routable value as `slug`. German therefore serializes the active
// round as { name: "2026-08-tiere", slug: "2026-08-animals" }. Use the name
// for display and date-prefix matching, and this value for URL/API paths.
export function tagSlug(tag) {
  return typeof tag === "string" ? tag : tag?.slug || tag?.name || "";
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

// A round's own page: the category-scoped tag listing,
// /tags/c/<category-slug>/<category-id>/<tag-slug>/<tag-id>. Discourse already
// renders it as the round's masonry grid; Phase C (#7) only links to it and
// renders the challenge band there. Built from the canonical slug and the
// numeric id, never the localized name, which 404s as a route key.
export function roundPageUrl(tag) {
  const id = typeof tag === "object" ? Number(tag?.id) || 0 : 0;
  const slug = tagSlug(tag);
  if (!id || !slug) {
    return tagPageUrl(tag);
  }
  const categoryId = Number(settings.challenge_category_id);
  const categorySlug = challengeCategorySlug();
  const categoryPath = categorySlug
    ? `${encodeURIComponent(categorySlug)}/${categoryId}`
    : `${categoryId}`;
  return `/tags/c/${categoryPath}/${encodeURIComponent(slug)}/${id}`;
}

// A finished round opens on its Votes list (Topic Voting's /l/votes), so
// the entries read top to bottom in finishing order next to their rank
// badges. The open round keeps Latest: ranking it mid-month would turn the
// grid into a live scoreboard, which the band deliberately avoids.
function roundListUrl(tag, open) {
  const url = roundPageUrl(tag);
  return open || !url.startsWith("/tags/c/") ? url : `${url}/l/votes`;
}

// The round a URL is the page of, or null. Matches the sort filters too
// (/l/votes), which is how the round page's own Latest/Votes pills link.
export function roundFromUrl(url) {
  const path = new URL(url, window.location.origin).pathname.replace(
    /\/+$/,
    ""
  );
  const categoryId = Number(settings.challenge_category_id);
  const match = new RegExp(
    `^/tags/c/(?:[^/]+/)?${categoryId}/([^/]+)/(\\d+)(?:/l/[^/]+)?$`
  ).exec(path);
  if (!match || !/^\d{4}-\d{2}/.test(decodeURIComponent(match[1]))) {
    return null;
  }
  return { slug: decodeURIComponent(match[1]), id: Number(match[2]) };
}

let categoryTopicsPromise = null;
let pinnedBriefPromise = null;
let roundTagsPromise = null;
let userRoundsPromise = null;
let userRoundsFor = "";

export function clearPinnedBriefCache() {
  categoryTopicsPromise = null;
  pinnedBriefPromise = null;
  roundTagsPromise = null;
  userRoundsPromise = null;
  roundBriefCache.clear();
  roundEntriesCache.clear();
}

// The challenge renderer and the staff panel mount during the same page load
// and both need this listing. Sharing the in-flight promise prevents two
// identical requests from racing each other into Discourse's rate limiter.
export function fetchChallengeCategoryTopics() {
  categoryTopicsPromise ||= ajax(`${categoryRoute()}/l/latest.json`).then(
    (data) => data?.topic_list?.topics || []
  );
  return categoryTopicsPromise;
}

function fetchPinnedBrief() {
  pinnedBriefPromise ||= (async () => {
    try {
      const topics = await fetchChallengeCategoryTopics();
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
        tag_slug: tagSlug(roundTag),
        tag_id: Number(roundTag?.id) || 0,
        tag_page_url: tagPageUrl(roundTag),
        round_page_url: roundPageUrl(roundTag),
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
    tag_slug: brief.tag_slug,
    tag_id: brief.tag_id,
    tag_page_url: brief.tag_page_url,
    round_page_url: brief.round_page_url,
    status: "active",
    start_at: `${year}-${pad(month)}-01T00:00:00+02:00`,
    submission_deadline: `${year}-${pad(month)}-${pad(lastDay)}T23:59:00+02:00`,
    // The round's calendar month controls voting — see challengeState().
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
            tag_slug: derived.tag_slug,
            tag_id: derived.tag_id,
            round_page_url: derived.round_page_url,
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

let winnersPromise = null;

export function clearWinnerCache() {
  winnersPromise = null;
}

// The challenge category's slug, derived from the live category so a slug
// rename in category admin is followed automatically. Never a setting: the id
// is the stable key, the slug is decoration Discourse can resolve without.
function challengeCategorySlug() {
  return (
    Category.findById(Number(settings.challenge_category_id))?.slug || ""
  ).trim();
}

// JSON ONLY. The name-based category+tag route survives solely for json/rss
// formats on current Discourse; as an HTML page this path 404s. User-facing
// hrefs go through tagPageUrl() instead.
function tagListJsonUrl(tag) {
  const categoryId = Number(settings.challenge_category_id);
  const slug = challengeCategorySlug();
  const categoryPath = slug ? `${slug}/${categoryId}` : `${categoryId}`;
  return `/tags/c/${categoryPath}/${encodeURIComponent(tag)}.json`;
}

// Month name alone ("July"), not month + year: it feeds the winner chip,
// which reproduces the design's "JULY WINNER · CITYSCAPES" and has no room
// for a year that is almost always the current one anyway.
function roundMonthName(tag) {
  const date = roundDate(tag);
  if (!date) {
    return "";
  }
  return localizedDateFormat({ month: "long" }).format(date);
}

function roundThemeLabel(tag, challenge, briefTitle) {
  const title = localized(challenge, "title") || challenge?.title || briefTitle;
  if (title?.trim()) {
    return title.trim();
  }

  const suffix = (tag || "")
    .replace(/^\d{4}-\d{2}-?/, "")
    .replaceAll("-", " ")
    .trim();
  return suffix ? suffix.charAt(0).toUpperCase() + suffix.slice(1) : "";
}

// Every winner-tagged topic, newest round first. One request serves the
// band's latest winner, the round switcher's "Results" state and the round
// pages; the promise is cached until the TTL expiry, failures included —
// clearing on failure would re-arm the fetch on the next observed mutation.
function fetchWinners() {
  winnersPromise ||= ajax(tagListJsonUrl(WINNER_TAG))
    .then((data) => {
      const users = data?.users || [];
      return (
        (data?.topic_list?.topics || [])
          .map((topic) => ({ topic, roundTag: findRoundTag(topic.tags) }))
          .filter((entry) => entry.roundTag)
          // Round tags sort chronologically as strings; newest round first.
          .sort((a, b) =>
            tagSlug(b.roundTag).localeCompare(tagSlug(a.roundTag))
          )
          .map(({ topic, roundTag }) => {
            const authorId =
              (topic.posters || []).find((poster) =>
                (poster.description || "").toLowerCase().includes("original")
              )?.user_id ?? topic.posters?.[0]?.user_id;
            const author = users.find((user) => user.id === authorId);
            return {
              tag: tagName(roundTag),
              slug: tagSlug(roundTag),
              tagId: Number(roundTag?.id) || 0,
              tagPage: tagPageUrl(roundTag),
              topicId: topic.id,
              title: topic.title || topic.fancy_title || "",
              author: author?.name || author?.username || "",
              // Topic Voting serializes vote_count onto the same listing the
              // rest of this record comes from — no extra request. The admin
              // panel's ranked list reads the identical field.
              votes: Number(topic.vote_count) || 0,
              image: topic.image_url || "",
              url: topic.slug
                ? `/t/${encodeURIComponent(topic.slug)}/${topic.id}`
                : `/t/${topic.id}`,
            };
          })
      );
    })
    .catch(() => []);
  return winnersPromise;
}

// A round's brief is its first-created topic: staff post it to start the
// round, before any entry exists. per_page=1 makes this a one-topic listing,
// and it is public even after the brief is unpinned. One cached promise per
// round, shared by the band, the switcher and the round pages.
function fetchRoundBrief(slug) {
  if (!roundBriefCache.has(slug)) {
    roundBriefCache.set(
      slug,
      ajax(`${tagListJsonUrl(slug)}?order=created&ascending=true&per_page=1`)
        .then((data) => {
          const topic = data?.topic_list?.topics?.[0];
          if (!topic) {
            return null;
          }
          return {
            id: topic.id,
            title: topic.title || "",
            image: topic.image_url || "",
            excerpt:
              (topic.excerpt || "")
                .split(/\r?\n/)
                .map((line) => line.trim())
                .find(Boolean) || "",
            url: topic.slug
              ? `/t/${encodeURIComponent(topic.slug)}/${topic.id}`
              : `/t/${topic.id}`,
          };
        })
        .catch(() => null)
    );
  }
  return roundBriefCache.get(slug);
}

// Every round tag that has topics, newest first, with its numeric id (round
// page URLs need it) and its topic count (entries + the brief). /tags.json is
// public and one request covers every round.
function fetchRoundTags() {
  roundTagsPromise ||= ajax("/tags.json")
    .then((data) =>
      (data?.tags || [])
        .filter(
          (tag) => /^\d{4}-\d{2}/.test(tagSlug(tag)) && Number(tag.count) > 0
        )
        .map((tag) => ({
          id: Number(tag.id) || 0,
          slug: tagSlug(tag),
          name: tagName(tag),
          count: Number(tag.count) || 0,
        }))
        .sort((a, b) => b.slug.localeCompare(a.slug))
    )
    .catch(() => []);
  return roundTagsPromise;
}

// Every entry in one round, most votes first, the brief excluded. Pages are
// fetched once, in sequence, and the whole result is one cached promise per
// round (observer rule 2) — September alone is two pages.
function fetchRoundEntries(slug) {
  if (!roundEntriesCache.has(slug)) {
    roundEntriesCache.set(
      slug,
      (async () => {
        const topics = new Map();
        const users = new Map();
        for (let page = 0; page < MAX_ROUND_PAGES; page++) {
          const data = await ajax(
            `${tagListJsonUrl(slug)}?order=votes${page ? `&page=${page}` : ""}`
          );
          const batch = data?.topic_list?.topics || [];
          batch.forEach((topic) => topics.set(topic.id, topic));
          (data?.users || []).forEach((user) => users.set(user.id, user));
          if (!batch.length || !data?.topic_list?.more_topics_url) {
            break;
          }
        }
        const brief = await fetchRoundBrief(slug);
        topics.delete(brief?.id);
        return {
          topics: [...topics.values()].sort(
            (a, b) => (Number(b.vote_count) || 0) - (Number(a.vote_count) || 0)
          ),
          users: [...users.values()],
        };
      })().catch(() => null)
    );
  }
  return roundEntriesCache.get(slug);
}

function winnerRecord(tagged, challenges, briefTitle) {
  const override = challenges.find((c) => c.tag === tagged.tag);
  return {
    tag: tagged.tag,
    monthName: roundMonthName(tagged.slug),
    theme: roundThemeLabel(tagged.slug, override, briefTitle),
    title: override?.winner_title || tagged.title,
    author: override?.winner_author || tagged.author,
    votes: tagged.votes,
    image: uploadUrl(override?.winner_image) || tagged.image,
    href: override?.gallery_url || tagged.url,
    entryCount: Number(override?.entry_count) || 0,
  };
}

async function resolveLatestWinner(challenges) {
  const tagged = (await fetchWinners())[0];
  if (tagged) {
    // The brief starts the round before entries are submitted. Read its
    // public listing title even after staff have unpinned the old round.
    const brief = await fetchRoundBrief(tagged.slug);
    return winnerRecord(tagged, challenges, brief?.title);
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
  const startDate = roundDate(previous.tag) || validDate(previous.start_at);
  return {
    tag: previous.tag,
    monthName: startDate
      ? localizedDateFormat({ month: "long" }).format(startDate)
      : roundMonthName(previous.tag),
    theme: challengeTitle(hydrated),
    title: previous.winner_title,
    author: previous.winner_author || "",
    votes: 0,
    image: uploadUrl(previous.winner_image),
    href:
      previous.gallery_url ||
      previous.winner_topic_url ||
      hydrated.topic?.url ||
      categoryRoute(),
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
  const categoryId = Number(settings.challenge_category_id);
  const categorySlug = challengeCategorySlug();

  return (
    path === `/c/${categoryId}` ||
    path === `/c/${categorySlug}/${categoryId}` ||
    path.startsWith(`/c/${categorySlug}/${categoryId}/`) ||
    Boolean(roundFromUrl(url))
  );
}

// "All rounds": the bare category page, which the header link and the
// homepage door used to point at and which now forwards them to the open
// round. Sort filters (/l/votes) are deliberate choices and are not matched.
function isChallengeCategoryRoot(url) {
  const path = new URL(url, window.location.origin).pathname.replace(/\/+$/, "");
  const categoryId = Number(settings.challenge_category_id);
  return (
    path === `/c/${categoryId}` ||
    path === `/c/${challengeCategorySlug()}/${categoryId}`
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

function daysLeftText(challenge) {
  const deadline = validDate(challenge.submission_deadline);
  // floor, not ceil: the deadline is 23:59 on the last day, so flooring
  // the difference counts calendar days with today as day zero — on
  // August 7 a deadline of August 31 reads "24 days left". ceil counted
  // the rest of today as a full day and was one high all month.
  const daysLeft = deadline
    ? Math.floor((deadline.getTime() - Date.now()) / 86_400_000)
    : 0;
  if (daysLeft <= 0) {
    return "";
  }
  // Two flat keys rather than a pluralized one: Discourse flattens theme
  // translations, so one:/other: subkeys do not survive to the client.
  return daysLeft === 1
    ? translate("days_left_one")
    : translate("days_left", { count: daysLeft });
}

function deadlineText(challenge, state) {
  if (state === "submissions-open" && challenge.submission_deadline) {
    const dateText = translate("open_deadlines", {
      date: formatDate(challenge.submission_deadline),
    });
    const daysText = daysLeftText(challenge);
    return daysText ? `${daysText} · ${dateText}` : dateText;
  }
  if (state === "closed") {
    return translate("voting_closed");
  }
  return "";
}

// The open round's status line: deadline and days left, then the signed-in
// entrant's "Your entries: 2 of 3 · Votes so far: 4". It replaced the
// three-step timeline and the thumbnail block when the band went compact.
function statusText(deadline, mine) {
  if (!mine?.count) {
    return deadline;
  }
  const max = Number(settings.challenge_max_entries_per_round) || 0;
  return [
    deadline,
    max
      ? translate("your_entries", { count: mine.count, max })
      : translate("your_entries_plain", { count: mine.count }),
    translate("your_votes", { count: mine.votes }),
  ]
    .filter(Boolean)
    .join(" · ");
}

// The band: one navy strip holding this month's challenge on the left and
// last month's winner as a large photograph on the right (design handoff
// 2026-08-07). It replaced the hero + current-round showcase + winner strip
// stack, but it is still THE challenge hero — same element, same
// "challenge" marker, same .spc-hero--challenge class and the same
// .spc-hero__actions > .spc-button--primary structure, because
// spc-photo-submit.js routes the primary button to /submit by exactly that
// selector and clearHero()'s scoping keys off the marker. It goes through
// ensureHero() rather than renderHero() only because the two-cell grid is
// markup the generic slot renderer cannot express; the lifecycle is shared.
//
// This category is NOT gated by enable_category_hero and must not be: the
// band is part of the route-map, permalink and route:new-topic stack behind
// /submit, and a half-enabled state breaks photo submission.
// The results variant (#8): the winner stays in the photograph cell, and the
// text cell trades the brief's lead for the round's totals and 2nd and 3rd.
function resultsMarkup(results) {
  const podium = results.podium
    .map(
      (entry) => `<li><a href="${escapeHtml(entryUrl(entry.topic))}">
        <span class="spc-rank spc-rank--${Math.min(entry.place, 4)}">${escapeHtml(
          placeLabel(entry)
        )}</span>
        ${
          entry.topic.image_url
            ? `<img src="${escapeHtml(entry.topic.image_url)}" alt="">`
            : ""
        }
        <span class="spc-challenge-band__podium-text">
          <strong>${escapeHtml(entry.topic.title)}</strong>
          <span>${escapeHtml(
            [
              entryAuthor(entry.topic, results.users),
              translate("winner_votes", { count: entry.votes }),
            ]
              .filter(Boolean)
              .join(" · ")
          )}</span>
        </span>
      </a></li>`
    )
    .join("");
  return `<p class="spc-challenge-band__stats">${escapeHtml(
    translate("results_stats", {
      entries: results.ranked.length,
      votes: results.totalVotes,
    })
  )}</p>
  ${podium ? `<ol class="spc-challenge-band__podium">${podium}</ol>` : ""}`;
}

function renderChallengeBand(challenge, winner, mine = null, results = null) {
  const state = challengeState(challenge);
  const isOpen = challenge.status === "active" && state === "submissions-open";
  const title = challengeTitle(challenge);
  const month = monthLabel(challenge);
  const deadline = deadlineText(challenge, state);
  // Incomplete data shows nothing rather than something wrong: the winner
  // cell waits for a winner-tagged topic with a photograph (or a completed
  // registry record). Without one, the challenge cell spans the full band —
  // the design's empty state, no placeholder frame.
  const hasWinner = Boolean(winner?.title && winner.image);

  const hero = ensureHero(HERO_MARKER, "challenge");
  if (!hero) {
    return;
  }

  // A previous category's hero may hand this element over with its cover
  // still applied; the band is flat indigo with no cover or shade.
  hero.style.removeProperty("--spc-hero-cover");
  hero.classList.remove("spc-hero--with-cover");
  hero.classList.toggle("spc-hero--with-winner", hasWinner);
  hero.classList.toggle("spc-hero--results", Boolean(results));

  const signature = [
    challenge.tag,
    challenge.topic?.updatedAt,
    state,
    localeCode(),
    title,
    deadline,
    challenge.topic?.url,
    mine ? [mine.count, mine.votes, ...mine.images].join("|") : "",
    results
      ? [
          results.ranked.length,
          results.totalVotes,
          ...results.podium.map((entry) => `${entry.topic.id}:${entry.votes}`),
        ].join("|")
      : "",
    hasWinner
      ? [
          winner.tag,
          winner.title,
          winner.author,
          winner.votes,
          winner.entryCount,
          winner.image,
          winner.href,
        ].join("|")
      : "",
  ].join("-");

  if (hero.dataset.spcHeroSignature === signature) {
    return;
  }
  hero.dataset.spcHeroSignature = signature;

  // Open: a <button> the capture-phase handler in spc-photo-submit.js
  // intercepts and routes to /submit. Closed: a plain anchor down to the
  // entry grid. The data attribute is what distinguishes them.
  const primaryAction = isOpen
    ? `<button class="spc-button spc-button--primary" type="button" data-spc-submit-photo>${escapeHtml(
        translate("submit_photo")
      )}</button>`
    : `<a class="spc-button spc-button--primary" href="#list-area">${escapeHtml(
        translate("view_entries")
      )}</a>`;

  const winnerChip = results
    ? translate("winner")
    : hasWinner
    ? winner.theme
      ? translate("winner_chip", {
          month: winner.monthName,
          theme: winner.theme,
        })
      : translate("winner_chip_plain", { month: winner.monthName })
    : "";
  const winnerMeta = hasWinner
    ? [
        winner.author ? translate("by_author", { author: winner.author }) : "",
        winner.votes > 0 && winner.entryCount > 0
          ? translate("winner_votes_of_entries", {
              votes: winner.votes,
              entries: winner.entryCount,
            })
          : winner.votes > 0
            ? translate("winner_votes", { count: winner.votes })
            : winner.entryCount > 0
              ? translate("entries", { count: winner.entryCount })
              : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  // The winner cell is a single link to the winning post — no separate text
  // link, removed deliberately in the design.
  hero.innerHTML = `
    <div class="spc-hero__content spc-challenge-band__challenge">
      <div class="spc-challenge-band__kicker">
        <span class="spc-challenge-band__chip">${escapeHtml(translate("label"))}</span>
        ${month ? `<span class="spc-challenge-band__month">${escapeHtml(
          results ? `${month} · ${translate("round_results")}` : month
        )}</span>` : ""}
      </div>
      <h1 id="spc-hero-title">${escapeHtml(title)}</h1>
      ${results ? resultsMarkup(results) : ""}
      ${
        !results && (deadline || mine?.count)
          ? `<p class="spc-challenge-band__status">${escapeHtml(
              isOpen ? statusText(deadline, mine) : deadline
            )}</p>`
          : ""
      }
      <div class="spc-hero__actions">
        ${primaryAction}
        <span class="spc-challenge-band__links">
          ${
            challenge.topic?.url
              ? `<a href="${escapeHtml(challenge.topic.url)}">${escapeHtml(
                  translate("read_brief")
                )}</a>`
              : ""
          }
          <button type="button" data-spc-open-voting>${escapeHtml(
            translate("how_voting_works")
          )}</button>
        </span>
      </div>
    </div>
    ${
      hasWinner
        ? `<a class="spc-challenge-band__winner" href="${escapeHtml(
            winner.href || categoryRoute()
          )}">
      <img src="${escapeHtml(winner.image)}" alt="${escapeHtml(winner.title)}">
      <span class="spc-challenge-band__winner-chip">${escapeHtml(winnerChip)}</span>
      <span class="spc-challenge-band__winner-caption">
        <span class="spc-challenge-band__winner-title">${escapeHtml(winner.title)}</span>
        ${winnerMeta ? `<span class="spc-challenge-band__winner-meta">${escapeHtml(winnerMeta)}</span>` : ""}
      </span>
    </a>`
        : ""
    }
  `;
}

// The rounds the switcher lists: the newest SWITCHER_ROUNDS, plus the round
// being viewed when it is older than those. Labels come from the month and
// the brief's title through roundThemeLabel(); URLs from the canonical slug
// and the tag id, never the localized name.
async function switcherRounds(challenges, pageRound) {
  const [tags, winners] = await Promise.all([fetchRoundTags(), fetchWinners()]);
  const shown = tags.slice(0, SWITCHER_ROUNDS);
  const viewed = pageRound && tags.find((tag) => tag.id === pageRound.id);
  if (viewed && !shown.includes(viewed)) {
    shown.push(viewed);
  }
  const briefs = await Promise.all(shown.map((tag) => fetchRoundBrief(tag.slug)));
  const current = currentMonthYM();
  return shown.map((tag, index) => {
    const month = tag.slug.slice(0, 7);
    return {
      id: tag.id,
      url: roundListUrl(tag, month >= current),
      theme: roundThemeLabel(
        tag.slug,
        challenges.find((c) => c.tag === tag.name || c.tag === tag.slug),
        briefs[index]?.title
      ),
      month: monthLabel({ tag: tag.slug }),
      // The tag count includes the brief, which is not an entry.
      entries: Math.max(0, tag.count - (briefs[index] ? 1 : 0)),
      state:
        month >= current
          ? "open"
          : winners.some((winner) => winner.tagId === tag.id)
            ? "results"
            : "closed",
    };
  });
}

// Inside the category surface, under the band and above Discourse's list
// controls — never between the controls and the list. Our own element,
// marked with COMPONENT_SELECTOR so repairLegacyCategoryLinks skips it.
function renderRoundSwitcher(rounds, pageRound) {
  const surface = categorySurface();
  if (!surface || !rounds.length) {
    return;
  }
  const signature = JSON.stringify([rounds, pageRound?.id || 0, localeCode()]);
  let nav = surface.querySelector(".spc-rounds-nav");
  if (nav?.dataset.spcChallengeSignature === signature) {
    return;
  }
  if (!nav) {
    nav = document.createElement("nav");
    nav.className = "spc-rounds-nav";
    nav.dataset.spcMonthlyChallenge = "rounds";
    surface.append(nav);
  }
  nav.dataset.spcChallengeSignature = signature;
  nav.setAttribute("aria-label", translate("rounds_label"));
  nav.innerHTML = `${rounds
    .map((round) => {
      const current = pageRound?.id === round.id;
      return `<a class="spc-rounds-nav__round${current ? " is-current" : ""}" href="${escapeHtml(
        round.url
      )}"${current ? ' aria-current="page"' : ""}>
        <strong>${escapeHtml(round.theme)} <span class="spc-rounds-nav__state spc-rounds-nav__state--${round.state}">${escapeHtml(
          translate(`round_${round.state}`)
        )}</span></strong>
        <span>${escapeHtml(round.month)} · ${escapeHtml(
          translate("entries", { count: round.entries })
        )}</span>
      </a>`;
    })
    .join("")}
    <a class="spc-rounds-nav__all${pageRound ? "" : " is-current"}" href="${escapeHtml(
      categoryRoute()
    )}"${pageRound ? "" : ' aria-current="page"'}>${escapeHtml(translate("all_rounds"))} →</a>`;
}

// Rank by raw vote_count, the rule settled in #0. Competition ranking: an
// entry's place is one more than the number of entries with strictly more
// votes, so ties share a place ("=5") and the next place is skipped.
export function rankEntries(topics) {
  const votes = topics.map((topic) => Number(topic.vote_count) || 0);
  return topics
    .map((topic, index) => {
      const own = votes[index];
      return {
        topic,
        votes: own,
        place: 1 + votes.filter((other) => other > own).length,
        tied: votes.filter((other) => other === own).length > 1,
      };
    })
    .sort((a, b) => a.place - b.place);
}

function placeLabel(entry) {
  return `${entry.tied ? "=" : ""}${entry.place}`;
}

// "1st", "=5th"; "1.", "=5."; "1er", "=5e".
function ordinalLabel(entry) {
  const n = entry.place;
  const language = localeCode();
  let text;
  if (language === "de") {
    text = `${n}.`;
  } else if (language === "fr") {
    text = n === 1 ? "1er" : `${n}e`;
  } else {
    const tens = n % 100;
    const suffix =
      tens >= 11 && tens <= 13
        ? "th"
        : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
    text = `${n}${suffix}`;
  }
  return `${entry.tied ? "=" : ""}${text}`;
}

function entryUrl(topic) {
  return topic.slug
    ? `/t/${encodeURIComponent(topic.slug)}/${topic.id}`
    : `/t/${topic.id}`;
}

function entryAuthor(topic, users) {
  const user = users.find((u) => u.id === topic.posters?.[0]?.user_id);
  return user?.name || user?.username || "";
}

// The ranked round behind the results view, the rank badges and "Your
// result". Every page of the ?order=votes listing, fetched once per round.
async function roundResults(slug, winnerTopicId) {
  const round = await fetchRoundEntries(slug);
  if (!round?.topics?.length) {
    return null;
  }
  const ranked = rankEntries(round.topics);
  return {
    ranked,
    users: round.users,
    winnerTopicId,
    totalVotes: ranked.reduce((sum, entry) => sum + entry.votes, 0),
    // 2nd and 3rd beside the winner: the next two by rank, whatever the
    // winner tag says about first place.
    podium: ranked
      .filter((entry) => entry.topic.id !== winnerTopicId)
      .slice(0, 2),
  };
}

// A closed round shown on its own page: the band carries that round's brief
// and that round's winner instead of the open round's. A round with a
// winner-tagged topic switches to results (#8).
async function resolvePastRound(pageRound, challenges) {
  const [brief, winners] = await Promise.all([
    fetchRoundBrief(pageRound.slug),
    fetchWinners(),
  ]);
  const tagged = winners.find((winner) => winner.tagId === pageRound.id);
  const results = tagged
    ? await roundResults(pageRound.slug, tagged.topicId)
    : null;
  return {
    results,
    challenge: {
      tag: pageRound.slug,
      tag_slug: pageRound.slug,
      status: "archived",
      topic_id: brief?.id || 0,
      topic: {
        title: brief?.title || roundThemeLabel(pageRound.slug),
        summary: brief?.excerpt || "",
        url: brief?.url || "",
        updatedAt: "round",
      },
    },
    winner: tagged ? winnerRecord(tagged, challenges, brief?.title) : null,
  };
}

// A rank badge on every card of a results page (#8). The card is a row Topic
// List Thumbnails has measured, so nothing is inserted into it: the place
// rides in a data- attribute on the thumbnail box (already position:
// relative) and challenge.scss draws it with an absolutely positioned
// ::before. No height changes, no element of ours inside a core row.
function applyRankBadges(results) {
  const byId = new Map(
    (results?.ranked || []).map((entry) => [entry.topic.id, entry])
  );
  document
    .querySelectorAll(
      "tr.topic-list-item[data-topic-id] .topic-list-thumbnail, .topic-list-thumbnail[data-spc-rank]"
    )
    .forEach((thumb) => {
      const row = thumb.closest("tr.topic-list-item[data-topic-id]");
      const entry = row && byId.get(Number(row.dataset.topicId));
      if (!entry) {
        delete thumb.dataset.spcRank;
        delete thumb.dataset.spcPlace;
        return;
      }
      const label = placeLabel(entry);
      if (thumb.dataset.spcRank !== label) {
        thumb.dataset.spcRank = label;
        thumb.dataset.spcPlace = String(Math.min(entry.place, 4));
      }
    });
}

function countText(key, count) {
  return count === 1 ? translate(`${key}_one`) : translate(key, { count });
}

// "Your result" (#8): signed in, under the switcher, in one of three states
// — you won, you entered (one line per entry, best first), you did not
// enter (with a way into the open round).
function renderYourResult(results, user, theme, active) {
  const surface = categorySurface();
  let strip = surface?.querySelector(".spc-your-result");
  if (!surface || !results || !user) {
    strip?.remove();
    return;
  }

  const total = results.ranked.length;
  const thirdVotes = results.ranked[2]?.votes ?? 0;
  const mine = results.ranked.filter(
    (entry) => entry.topic.posters?.[0]?.user_id === user.id
  );

  const lines = mine.map((entry) => {
    const won = entry.topic.id === results.winnerTopicId;
    const shared =
      results.ranked.filter((other) => other.votes === entry.votes).length - 1;
    const runnerUp = results.ranked.find(
      (other) => other.topic.id !== entry.topic.id
    );
    const ahead = won && runnerUp ? entry.votes - runnerUp.votes : 0;
    const behind = !won && entry.place > 3 ? thirdVotes - entry.votes : 0;
    const details = [
      translate("winner_votes", { count: entry.votes }),
      shared > 0 ? countText("result_shared", shared) : "",
      ahead > 0 ? countText("result_ahead_second", ahead) : "",
      behind > 0 ? countText("result_behind_third", behind) : "",
    ].filter(Boolean);
    return `<div class="spc-your-result__line${won ? " spc-your-result__line--won" : ""}">
      ${entry.topic.image_url ? `<img src="${escapeHtml(entry.topic.image_url)}" alt="">` : ""}
      <div class="spc-your-result__text">
        <span class="spc-your-result__kicker">${escapeHtml(
          translate(won ? "result_you_won" : "result_you_entered")
        )}</span>
        <a href="${escapeHtml(entryUrl(entry.topic))}">${escapeHtml(entry.topic.title)}</a>
        <small>${escapeHtml(details.join(" · "))}</small>
      </div>
      <div class="spc-your-result__rank">
        <strong>${escapeHtml(ordinalLabel(entry))}</strong>
        <span>${escapeHtml(translate("result_of_entries", { count: total }))}</span>
      </div>
    </div>`;
  });

  const openRound =
    active?.status === "active" && challengeState(active) === "submissions-open";
  const none = `<div class="spc-your-result__line spc-your-result__line--none">
    <div class="spc-your-result__text">
      <span class="spc-your-result__kicker">${escapeHtml(translate("result_not_entered"))}</span>
      <strong>${escapeHtml(translate("result_entered_count", { count: total, theme }))}</strong>
      ${
        openRound
          ? `<small>${escapeHtml(
              translate("result_open_round", {
                theme: challengeTitle(active),
                date: formatDate(active.submission_deadline),
              })
            )}</small>`
          : ""
      }
    </div>
    ${
      openRound && active.round_page_url
        ? `<a class="spc-button spc-button--primary" href="${escapeHtml(
            active.round_page_url
          )}">${escapeHtml(
            translate("result_enter", {
              month: roundMonthName(active.tag_slug || active.tag),
            })
          )}</a>`
        : ""
    }
  </div>`;

  const html = lines.length ? lines.join("") : none;
  const signature = `${localeCode()}|${html}`;
  if (strip?.dataset.spcChallengeSignature === signature) {
    return;
  }
  if (!strip) {
    strip = document.createElement("section");
    strip.className = "spc-your-result";
    strip.dataset.spcMonthlyChallenge = "your-result";
    surface.append(strip);
  }
  strip.dataset.spcChallengeSignature = signature;
  strip.setAttribute("aria-label", translate("result_label"));
  strip.innerHTML = html;
}

// Which rounds the viewer entered: one request for their own topics, so the
// archive ranks only those rounds rather than every round on the site.
// ponytail: first page only (30 topics); a member with more topics than that
// loses "You:" on their oldest rounds — follow more_topics_url if it matters.
function fetchUserRounds(username) {
  if (userRoundsFor !== username) {
    userRoundsFor = username;
    userRoundsPromise = null;
  }
  userRoundsPromise ||= ajax(
    `/topics/created-by/${encodeURIComponent(username)}.json`
  )
    .then(
      (data) =>
        new Set(
          (data?.topic_list?.topics || [])
            .filter(
              (topic) =>
                Number(topic.category_id) ===
                Number(settings.challenge_category_id)
            )
            .map((topic) => tagSlug(findRoundTag(topic.tags)))
            .filter(Boolean)
        )
    )
    .catch(() => new Set());
  return userRoundsPromise;
}

// The all-rounds archive (#9): one card per round on /c/<id>. Winners come
// from the winner listing the band already fetched, the theme from each
// round's brief, the entry count from the round tag (minus the brief). The
// viewer's best place costs one request plus each closed round they entered.
async function archiveRounds(challenges, active, user, mine) {
  const [tags, winners] = await Promise.all([fetchRoundTags(), fetchWinners()]);
  const briefs = await Promise.all(tags.map((tag) => fetchRoundBrief(tag.slug)));
  const current = currentMonthYM();
  const places = new Map();
  if (user?.username) {
    const entered = await fetchUserRounds(user.username);
    await Promise.all(
      tags
        .filter((tag) => entered.has(tag.slug) && tag.slug.slice(0, 7) < current)
        .map(async (tag) => {
          const round = await fetchRoundEntries(tag.slug);
          const best = rankEntries(round?.topics || []).find(
            (entry) => entry.topic.posters?.[0]?.user_id === user.id
          );
          if (best) {
            places.set(tag.id, best);
          }
        })
    );
  }
  return tags.map((tag, index) => {
    const brief = briefs[index];
    const winner = winners.find((w) => w.tagId === tag.id);
    const open = tag.slug.slice(0, 7) >= current;
    const entries = Math.max(0, tag.count - (brief ? 1 : 0));
    const isActive = isOpenRoundPage(tag, active);
    return {
      id: tag.id,
      url: roundListUrl(tag, open),
      month: monthLabel({ tag: tag.slug }),
      theme: roundThemeLabel(
        tag.slug,
        challenges.find((c) => c.tag === tag.name || c.tag === tag.slug),
        brief?.title
      ),
      image: winner?.image || brief?.image || "",
      state: open ? "open" : winner ? "results" : "closed",
      chip: open
        ? [translate("round_open"), isActive ? daysLeftText(active) : ""]
            .filter(Boolean)
            .join(" · ")
        : translate(winner ? "round_results" : "round_closed"),
      meta: open
        ? translate("archive_entries_so_far", { count: entries })
        : winner?.author
          ? translate("archive_winner", { author: winner.author, count: entries })
          : translate("entries", { count: entries }),
      you: open
        ? isActive && mine?.count
          ? translate("archive_you_entries", { count: mine.count })
          : ""
        : places.has(tag.id)
          ? translate("archive_you_place", { place: ordinalLabel(places.get(tag.id)) })
          : "",
    };
  });
}

function renderArchive(cards) {
  const surface = categorySurface();
  if (!surface || !cards.length) {
    return;
  }
  const signature = JSON.stringify([cards, localeCode()]);
  let section = surface.querySelector(".spc-rounds-archive");
  if (section?.dataset.spcChallengeSignature === signature) {
    return;
  }
  if (!section) {
    section = document.createElement("section");
    section.className = "spc-rounds-archive";
    section.dataset.spcMonthlyChallenge = "archive";
    surface.append(section);
  }
  section.dataset.spcChallengeSignature = signature;
  section.setAttribute("aria-labelledby", "spc-rounds-archive-title");
  section.innerHTML = `
    <span class="spc-eyebrow">${escapeHtml(translate("archive_eyebrow"))}</span>
    <h2 id="spc-rounds-archive-title">${escapeHtml(translate("archive_title"))}</h2>
    <div class="spc-rounds-archive__grid">${cards
      .map(
        (card) => `<a class="spc-rounds-archive__card spc-rounds-archive__card--${card.state}" href="${escapeHtml(
          card.url
        )}">
        ${card.image ? `<img src="${escapeHtml(card.image)}" alt="">` : ""}
        <span class="spc-rounds-archive__chip">${escapeHtml(card.chip)}</span>
        ${card.you ? `<span class="spc-rounds-archive__you">${escapeHtml(card.you)}</span>` : ""}
        <span class="spc-rounds-archive__body">
          <span class="spc-rounds-archive__month">${escapeHtml(card.month)}</span>
          <strong>${escapeHtml(card.theme)}</strong>
          <span class="spc-rounds-archive__meta">${escapeHtml(card.meta)}</span>
        </span>
      </a>`
      )
      .join("")}</div>`;
}

async function yourEntries(challenge, user) {
  if (!user) {
    return null;
  }
  const round = await fetchRoundEntries(challenge.tag_slug || challenge.tag);
  // posters[0] is the original poster in every Discourse listing; its
  // description string is localized, so it is not matched.
  const mine = (round?.topics || []).filter(
    (topic) => topic.posters?.[0]?.user_id === user.id
  );
  if (!mine.length) {
    return null;
  }
  return {
    count: mine.length,
    votes: mine.reduce((sum, topic) => sum + (Number(topic.vote_count) || 0), 0),
    images: mine
      .map((topic) => topic.image_url)
      .filter(Boolean)
      .slice(0, 3),
  };
}

function isOpenRoundPage(pageRound, active) {
  return Boolean(
    pageRound &&
      (pageRound.id === active.tag_id ||
        pageRound.slug === active.tag_slug ||
        pageRound.slug === active.tag)
  );
}

function archivedChallenges(challenges) {
  return challenges
    .filter((challenge) => challenge.status === "archived")
    .sort((a, b) => (validDate(b.start_at)?.getTime() || 0) - (validDate(a.start_at)?.getTime() || 0));
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

    // Every relabel below rides in data-spc-label, rendered by challenge.scss
    // through ::before — the text nodes inside these labels belong to Glimmer,
    // and replacing one detaches the node it tracks, so core's next re-render
    // of the element dies in removeChild and aborts the whole render
    // transaction (see updateCreateTopicButton in spc-category-hero.js).
    const uploadLabel = formWrapper.querySelector(".form-template-field__label");
    if (uploadLabel && uploadLabel.dataset.spcLabel !== translate("your_photo")) {
      uploadLabel.dataset.spcLabel = translate("your_photo");
    }
  }

  const titleInput = composer.querySelector("#reply-title");
  if (titleInput) {
    titleInput.placeholder = translate("photo_title_placeholder");
    titleInput.setAttribute("aria-label", translate("photo_title"));
  }

  const buttonLabel = translate("submit_photo");
  const actionLabel = composer.querySelector(".composer-actions-trigger .d-button-label");
  const submitLabel = composer.querySelector(".save-or-cancel .create .d-button-label");
  for (const labelElement of [actionLabel, submitLabel]) {
    if (labelElement && labelElement.dataset.spcLabel !== buttonLabel) {
      labelElement.dataset.spcLabel = buttonLabel;
      labelElement.closest("button")?.setAttribute("aria-label", buttonLabel);
    }
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
  const slug = challengeCategorySlug();
  if (!slug) {
    return;
  }
  const brokenPrefix = `/tags/c/${slug}/`;

  document.querySelectorAll("a[href]").forEach((link) => {
    // [data-spc-hero] as well as our own components: the hero used to carry
    // data-spc-monthly-challenge and was skipped by that first clause, and it
    // is now marked as a hero instead. None of its links match the broken
    // prefix today, but the exclusion was deliberate and is cheap to keep.
    if (link.closest(COMPONENT_SELECTOR) || link.closest("[data-spc-hero]")) {
      return;
    }
    const pathname = new URL(link.href, window.location.origin).pathname;
    // A round page carries the tag's numeric id and is a valid route; only
    // the old name-only form is broken. Without this exclusion the round
    // page's own Latest/Votes pills were rewritten to the category.
    if (pathname.startsWith(brokenPrefix) && !roundFromUrl(link.href)) {
      link.href = categoryRoute();
    }
  });
}

function repairInternalHeaderLinks() {
  // The separate Custom Header Links component emits target="_blank" for any
  // row whose target is not exactly "self", including legacy rows where the
  // setting is missing. Internal navigation should stay in this Discourse tab;
  // external header links keep the component's configured new-tab behaviour.
  document
    .querySelectorAll('.custom-header-links a[target="_blank"][href]')
    .forEach((link) => {
      const url = new URL(link.href, window.location.origin);
      if (url.origin === window.location.origin) {
        link.removeAttribute("target");
      }
    });
}

const spcRun = (api) => {
  const composerService = api.container.lookup("service:composer");
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
        ".spc-challenge-brief, .spc-challenge-education, .spc-challenge-archive, .spc-challenge-current, .spc-challenge-winner, .spc-rounds-nav, .spc-your-result, .spc-rounds-archive"
      )
      .forEach((element) => element.remove());
    applyRankBadges(null);
  }

  // The brief is not an entry (#7), so its own topic page offers no vote.
  // A brief is its round's first-created topic; the one-topic listing that
  // says so is fetched only on challenge topic pages, and cached. The class
  // goes on <body>, which core manages class by class rather than wholesale.
  async function markBriefTopic() {
    const onChallengeTopic =
      document.body.classList.contains("category-monthly-challenge") &&
      document.body.classList.contains("archetype-regular");
    const topic = onChallengeTopic
      ? api.container.lookup("controller:topic")?.model
      : null;
    const roundTag = findRoundTag(topic?.tags);
    const brief = roundTag ? await fetchRoundBrief(tagSlug(roundTag)) : null;
    const current = api.container.lookup("controller:topic")?.model;
    document.body.classList.toggle(
      "spc-challenge-brief-topic",
      Boolean(
        brief &&
          topic &&
          current === topic &&
          brief.id === topic.id &&
          document.body.classList.contains("archetype-regular")
      )
    );
  }

  async function render() {
    const request = ++renderRequest;

    // Needs no challenge data, so it runs before the gate below.
    repairLegacyCategoryLinks();
    repairInternalHeaderLinks();
    markBriefTopic().catch(() => {});

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

    // The band shows only the latest winner. One tag-listing request
    // resolves it (cached, TTL-expired) instead of fetching every
    // historical challenge topic on each visit to the category.
    // The band's two remaining inputs are independent, so they are fetched
    // together rather than one after the other.
    const pageRound = roundFromUrl(window.location.href);
    const showsOpenRound = !pageRound || isOpenRoundPage(pageRound, active);
    const [{ challenge: shown, winner, results = null }, mine] = await Promise.all([
      showsOpenRound
        ? resolveLatestWinner(challenges).then((latest) => ({
            challenge: active,
            winner: latest,
          }))
        : resolvePastRound(pageRound, challenges),
      showsOpenRound ? yourEntries(active, api.getCurrentUser()) : null,
    ]);
    if (request !== renderRequest) {
      return;
    }

    renderChallengeBand(shown, winner, mine, results);
    hideOfficialTopicRow(shown);
    applyRankBadges(results);
    renderYourResult(results, api.getCurrentUser(), challengeTitle(shown), active);

    const rounds = await switcherRounds(challenges, pageRound);
    if (request !== renderRequest) {
      return;
    }
    renderRoundSwitcher(rounds, pageRound);

    // "All rounds" is the category page itself; round pages have none.
    if (pageRound) {
      document.querySelector(".spc-rounds-archive")?.remove();
      return;
    }
    const cards = await archiveRounds(
      challenges,
      active,
      api.getCurrentUser(),
      mine
    );
    if (request !== renderRequest) {
      return;
    }
    renderArchive(cards);
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

  // The header's "Monthly Challenge" link and the homepage door lead to the
  // open round's page (#7). Intercepted at click time rather than rewritten
  // on load, so pages that show no challenge content still make zero
  // challenge requests; the hrefs stay /c/<id>, which is what a middle-click
  // or a copied link gets: "All rounds". /c/<id> itself never redirects —
  // the /submit route stack runs through it.
  document.addEventListener(
    "click",
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link = event.target.closest?.("a[href]");
      if (
        !link ||
        !link.closest(
          ".custom-header-links, .featured-categories__category-container"
        ) ||
        !isChallengeCategoryRoot(link.href)
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      const fallback = link.getAttribute("href");
      fetchPinnedBrief()
        .then((brief) => DiscourseURL.routeTo(brief?.round_page_url || fallback))
        .catch(() => DiscourseURL.routeTo(fallback));
    },
    { capture: true }
  );

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-spc-submit-photo]")) {
      const active = currentActive;
      if (!active) {
        return;
      }

      const category = Category.findById(Number(settings.challenge_category_id));
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

export default apiInitializer(spcRun);
