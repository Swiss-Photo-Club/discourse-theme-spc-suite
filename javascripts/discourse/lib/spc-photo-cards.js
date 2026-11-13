import { ajax } from "discourse/lib/ajax";
import { relativeAge } from "discourse/lib/formatter";

/**
 * Photo cards in our own markup: the "Needs feedback" strip on Photo Feedback
 * (Phase B) and the homepage rows on the Categories tab (Phase E). Both draw
 * the same card — 3:2 photo, title, "author · age" — from one page of a
 * category listing, and both read that listing through the cache below.
 *
 * The cache follows the observer rules in CLAUDE.md: the promise is cached
 * (rule 2), a failure clears it only behind a cool-off (rule 3), and it
 * expires on a TTL rather than per page (rule 5). Callers gate on need
 * before calling (rule 4).
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_COOL_OFF_MS = 60000;
const listings = new Map();

// One page of the category, newest first, whatever the category's own
// default sort is.
export function categoryListing(categoryId) {
  const entry = listings.get(categoryId) || { promise: null, at: 0, coolOffUntil: 0 };
  listings.set(categoryId, entry);

  if (entry.promise && Date.now() - entry.at > CACHE_TTL_MS) {
    entry.promise = null;
  }
  if (!entry.promise) {
    if (Date.now() < entry.coolOffUntil) {
      return Promise.reject(new Error("category listing is cooling off"));
    }
    entry.at = Date.now();
    entry.promise = ajax(`/c/${categoryId}/l/latest.json`, {
      data: { order: "created" },
    }).catch((error) => {
      entry.promise = null;
      entry.coolOffUntil = Date.now() + FAILURE_COOL_OFF_MS;
      // eslint-disable-next-line no-console
      console.error(`SPC: unable to load category ${categoryId}`, error);
      throw error;
    });
  }
  return entry.promise;
}

// True while a failed listing waits out its cool-off with nothing cached.
export function categoryListingCoolingOff(categoryId) {
  const entry = listings.get(categoryId);
  return Boolean(entry && !entry.promise && Date.now() < entry.coolOffUntil);
}

// The smallest generated thumbnail that still fills a ~200px card on a 2x
// screen; the original upload is the fallback.
function thumbnailUrl(topic) {
  const thumbnail = (topic.thumbnails || [])
    .filter((entry) => entry.width >= 400)
    .sort((a, b) => a.width - b.width)[0];
  return thumbnail?.url || topic.image_url;
}

// relativeAge() returns markup (<span class="date" title=…>); take its text.
function postedAge(topic) {
  const element = document.createElement("span");
  element.innerHTML = relativeAge(new Date(topic.created_at), {
    format: "medium-with-ago",
  });
  return element.textContent;
}

// Everything a card shows, as plain text and URLs. usersById comes from the
// same listing response.
export function photoCard(topic, usersById) {
  const user = usersById.get(topic.posters?.[0]?.user_id);
  return {
    href: `/t/${topic.slug}/${Number(topic.id)}`,
    image: thumbnailUrl(topic),
    title: topic.title,
    by: [user?.name || user?.username || "", postedAge(topic)]
      .filter(Boolean)
      .join(" · "),
  };
}

export function usersById(data) {
  return new Map((data?.users || []).map((user) => [user.id, user]));
}
