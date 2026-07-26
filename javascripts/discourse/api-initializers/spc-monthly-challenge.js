import { getOwnerWithFallback } from "discourse/lib/get-owner";
import { ajax } from "discourse/lib/ajax";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";

const COMPONENT_SELECTOR = "[data-spc-monthly-challenge]";
const RENDER_THROTTLE_MS = 200;
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

  return {
    id: Number(challenge?.topic_id) || 0,
    title: localized(challenge, "title") || translate("label"),
    summary,
    cooked: content,
    coverImage: "",
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

function uploadUrl(value) {
  if (Array.isArray(value)) {
    return uploadUrl(value[0]);
  }
  if (value && typeof value === "object") {
    return value.url || value.original_url || "";
  }
  return typeof value === "string" ? value : "";
}

function challengeState(challenge) {
  if (challenge?.status === "archived") {
    return "archived";
  }

  const now = Date.now();
  const submissionDeadline = validDate(challenge?.submission_deadline)?.getTime();
  const votingDeadline = validDate(challenge?.voting_deadline)?.getTime();

  if (!submissionDeadline || now <= submissionDeadline) {
    return "submissions-open";
  }
  if (!votingDeadline || now <= votingDeadline) {
    return "submissions-closed";
  }
  return "closed";
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
let pinnedBriefPromise = null;

function clearPinnedBriefCache() {
  pinnedBriefPromise = null;
}

function fetchPinnedBrief() {
  pinnedBriefPromise ||= (async () => {
    try {
      const data = await ajax(`${categoryRoute()}/l/latest.json`);
      const topics = data?.topic_list?.topics || [];
      const brief = topics.find(
        (topic) =>
          topic.pinned &&
          (topic.tags || []).some((tag) => /^\d{4}-\d{2}/.test(typeof tag === "string" ? tag : tag?.name))
      );
      if (!brief) {
        return null;
      }
      return {
        topic_id: brief.id,
        tag: (brief.tags || []).find((tag) => /^\d{4}-\d{2}/.test(tag)),
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
  const votingDate = new Date(year, month - 1, lastDay);
  votingDate.setDate(votingDate.getDate() + 3);

  return {
    topic_id: brief.topic_id,
    tag: brief.tag,
    status: "active",
    start_at: `${year}-${pad(month)}-01T00:00:00+02:00`,
    submission_deadline: `${year}-${pad(month)}-${pad(lastDay)}T23:59:00+02:00`,
    voting_deadline: `${votingDate.getFullYear()}-${pad(votingDate.getMonth() + 1)}-${pad(votingDate.getDate())}T23:59:00+02:00`,
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
            topic_id: Number(override.topic_id) || brief.topic_id,
            status: "active",
          }
        : derived;
    }
  }
  // Fallback: no pinned brief found — use the settings registry as before.
  return activeChallenge(challenges);
}

function isChallengePage() {
  return document.body.classList.contains(`category-${settings.monthly_category_slug}`);
}

function findHomeCard() {
  // Only ever use our own slot. Decorating the Ember-rendered Featured
  // Categories card is racy: Ember re-renders wipe the injected content,
  // which intermittently left the homepage card half-hydrated. The native
  // Monthly Challenge card is hidden via CSS instead.
  return document.querySelector(
    '[data-spc-monthly-challenge-slot="home"] > a'
  );
}

function ensureHomeCard() {
  if (!document.body.classList.contains("navigation-topics")) {
    return null;
  }

  const existing = findHomeCard();
  if (existing) {
    return existing;
  }

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
  if (
    state === "submissions-open" &&
    challenge.submission_deadline &&
    challenge.voting_deadline
  ) {
    return translate("active_deadlines", {
      submission_date: formatDate(challenge.submission_deadline),
      voting_date: formatDate(challenge.voting_deadline),
    });
  }
  if (state === "submissions-open") {
    return translate("submissions_close", {
      date: formatDate(challenge.submission_deadline),
    });
  }
  if (state === "submissions-closed") {
    return challenge.voting_deadline
      ? translate("submissions_closed_voting_open", {
          date: formatDate(challenge.voting_deadline),
        })
      : translate("closed");
  }
  if (state === "closed") {
    return translate("closed");
  }
  return "";
}

// The hero is our own element, inserted before the core category header,
// which CSS hides on this category. It used to be built by overwriting
// `.category-title-header` itself, and that was wrong twice over: Ember keeps
// that node across category navigations, so the challenge hero stayed on
// screen after switching to Critique, and it only reserved its dark styling
// under `body.category-monthly-challenge`, so the leftover markup rendered as
// dark text on a pale block over the category nav. Owning the node means
// clearHero() can simply delete it — see findHomeCard() for the same lesson.
function clearHero() {
  document.querySelector('[data-spc-monthly-challenge="hero"]')?.remove();
}

function ensureHero() {
  const existing = document.querySelector('[data-spc-monthly-challenge="hero"]');
  if (existing) {
    return existing;
  }

  const anchor = document.querySelector(".category-title-header");
  if (!anchor) {
    return null;
  }

  const hero = document.createElement("section");
  hero.className = "spc-hero spc-hero--challenge";
  hero.dataset.spcMonthlyChallenge = "hero";
  anchor.insertAdjacentElement("beforebegin", hero);
  return hero;
}

function renderHero(challenge) {
  const header = ensureHero();
  if (!header) {
    return;
  }

  const state = challengeState(challenge);
  const signature = `${challenge.tag}-${challenge.topic?.updatedAt}-${state}-${localeCode()}`;
  if (header.dataset.spcChallengeSignature === signature) {
    return;
  }

  const title = challengeTitle(challenge);
  const summary = challengeSummary(challenge);
  const winnerImage = uploadUrl(challenge.winner_image);
  const cover = winnerImage || uploadUrl(challenge.cover_image) || challenge.topic?.coverImage;
  const isOpen = challenge.status === "active" && state === "submissions-open";
  const primaryLabel = isOpen ? translate("submit_photo") : translate("view_entries");
  const primaryControl = isOpen
    ? `<button class="spc-button spc-button--primary" type="button" data-spc-submit-photo>${escapeHtml(
        primaryLabel
      )}</button>`
    : `<a class="spc-button spc-button--primary" href="#list-area">${escapeHtml(
        primaryLabel
      )}</a>`;
  const winnerLine =
    challenge.status === "archived" && challenge.winner_title
      ? `<a class="spc-hero__winner" href="${escapeHtml(
          challenge.winner_topic_url || challenge.topic?.url || categoryRoute()
        )}">
          <span>${escapeHtml(translate("winner"))}</span>
          <strong>${escapeHtml(challenge.winner_title)}</strong>
          ${
            challenge.winner_author
              ? `<small>${escapeHtml(translate("by_author", { author: challenge.winner_author }))}</small>`
              : ""
          }
        </a>`
      : "";

  header.dataset.spcChallengeSignature = signature;
  header.innerHTML = `
    <div class="spc-hero__shade"></div>
    <div class="spc-hero__content">
      <span class="spc-eyebrow">${escapeHtml(translate("label"))} · ${escapeHtml(
        monthLabel(challenge)
      )}</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(summary)}</p>
      ${deadlineText(challenge, state) ? `<span class="spc-hero__date">${escapeHtml(deadlineText(challenge, state))}</span>` : ""}
      ${winnerLine}
      <div class="spc-hero__actions">
        ${primaryControl}
        <button class="spc-button spc-button--secondary" type="button" data-spc-open-voting>
          ${escapeHtml(translate("how_voting_works"))}
        </button>
      </div>
    </div>
  `;

  if (cover) {
    header.style.setProperty("--spc-challenge-cover", `url("${cover.replaceAll('"', "%22")}")`);
    header.classList.add("spc-hero--with-cover");
  } else {
    header.style.removeProperty("--spc-challenge-cover");
    header.classList.remove("spc-hero--with-cover");
  }
}

function renderEducation(challenge) {
  const existing = document.querySelector(".spc-challenge-brief");
  if (!settings.show_education) {
    existing?.remove();
    return;
  }

  const cooked = challenge.topic?.cooked || "";
  const signature = `${challenge.tag}-${challenge.topic?.updatedAt}-${localeCode()}`;

  if (!cooked) {
    existing?.remove();
    return;
  }
  if (existing?.dataset.spcChallengeSignature === signature) {
    return;
  }

  existing?.remove();
  const section = document.createElement("section");
  section.className = "spc-challenge-brief";
  section.dataset.spcMonthlyChallenge = "brief";
  section.dataset.spcChallengeSignature = signature;
  section.innerHTML = `
    <header class="spc-challenge-brief__header">
      <div>
        <span class="spc-eyebrow">${escapeHtml(
          translate("official_brief")
        )}</span>
        <h2>${escapeHtml(challengeTitle(challenge))}</h2>
      </div>
      ${
        challenge.topic?.url
          ? `<a href="${escapeHtml(challenge.topic.url)}">${escapeHtml(
              translate("read_full_challenge")
            )} →</a>`
          : ""
      }
    </header>
    <div class="spc-challenge-brief__content cooked">${cooked}</div>
  `;

  document.querySelector(".category-title-header")?.insertAdjacentElement("afterend", section);
}

function archivedChallenges(challenges) {
  return challenges
    .filter((challenge) => challenge.status === "archived")
    .sort((a, b) => (validDate(b.start_at)?.getTime() || 0) - (validDate(a.start_at)?.getTime() || 0));
}

function renderArchive(challenges) {
  const existing = document.querySelector(".spc-challenge-archive");
  const archived = archivedChallenges(challenges);
  if (!settings.show_archive || archived.length === 0) {
    existing?.remove();
    return;
  }

  const signature = `${archived
    .map((challenge) => `${challenge.tag}:${challenge.topic?.updatedAt}`)
    .join("|")}-${localeCode()}`;
  if (existing?.dataset.spcChallengeSignature === signature) {
    return;
  }

  existing?.remove();
  const section = document.createElement("section");
  section.className = "spc-challenge-archive";
  section.dataset.spcMonthlyChallenge = "archive";
  section.dataset.spcChallengeSignature = signature;
  section.innerHTML = `
    <header class="spc-challenge-archive__header">
      <div>
        <span class="spc-eyebrow">${escapeHtml(translate("past_challenges"))}</span>
        <h2>${escapeHtml(translate("past_challenges"))}</h2>
      </div>
      <p>${escapeHtml(translate("past_challenges_intro"))}</p>
    </header>
    <div class="spc-challenge-archive__grid">
      ${archived
        .map((challenge) => {
          const image =
            uploadUrl(challenge.winner_image) ||
            uploadUrl(challenge.cover_image) ||
            challenge.topic?.coverImage;
          const title = challengeTitle(challenge);
          return `<a class="spc-challenge-archive-card" href="${escapeHtml(
            challenge.gallery_url || challenge.topic?.url || categoryRoute()
          )}" ${image ? `style="--spc-archive-image: url('${escapeHtml(image).replaceAll("'", "%27")}')"` : ""}>
            <span class="spc-challenge-archive-card__month">${escapeHtml(monthLabel(challenge))}</span>
            <span class="spc-challenge-archive-card__overlay">
              <strong>${escapeHtml(title)}</strong>
              ${
                challenge.winner_title
                  ? `<span>${escapeHtml(translate("winning_photo"))}: ${escapeHtml(
                      challenge.winner_title
                    )}</span>`
                  : ""
              }
              ${
                challenge.winner_author
                  ? `<small>${escapeHtml(translate("by_author", { author: challenge.winner_author }))}</small>`
                  : ""
              }
              ${
                Number(challenge.entry_count) > 0
                  ? `<small>${escapeHtml(
                      translate("entries", { count: Number(challenge.entry_count) })
                    )}</small>`
                  : ""
              }
            </span>
          </a>`;
        })
        .join("")}
    </div>
  `;

  const listContainer = document.querySelector(".container.list-container.--topic-list");
  if (listContainer) {
    listContainer.insertAdjacentElement("afterend", section);
  }
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
    if (link.closest(COMPONENT_SELECTOR)) {
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
      // Matches ensureHomeCard(): the homepage slot only exists here.
      document.body.classList.contains("navigation-topics") ||
      // renderComposer() prefills the round tag, but only while it is open.
      Boolean(document.querySelector("#reply-control.open"))
    );
  }

  function clearChallengeSections() {
    clearHero();
    document
      .querySelectorAll(
        ".spc-challenge-brief, .spc-challenge-education, .spc-challenge-archive"
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

    // Own the homepage slot from the start so Featured Categories does not
    // need to render a separate native Monthly card while topic data loads.
    prepareHomeCard(activeRecord);

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

    const archived = await Promise.all(
      challenges
        .filter((challenge) => challenge.status === "archived")
        .map((challenge) => hydrateChallenge(challenge))
    );
    if (request !== renderRequest) {
      return;
    }

    renderHero(active);
    renderEducation(active);
    renderArchive([active, ...archived]);
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
  }

  api.onPageChange(() => {
    expireStaleCaches();
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
