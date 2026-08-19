import { ajax } from "discourse/lib/ajax";
import Category from "discourse/models/category";
import I18n from "discourse-i18n";

// The subject tags the critique category will accept, fetched rather than
// hard-coded on purpose. That category requires at least one tag from the
// "Critique Subjects" tag group and /posts.json enforces it server-side, so
// asking Discourse which tags it will take means a form can never offer one it
// would then reject — add or remove a subject in admin and both forms follow
// without a code change.
export async function fetchSubjectTags(categoryId) {
  try {
    const result = await ajax("/tags/filter/search.json", {
      data: { q: "", categoryId, filterForInput: true },
    });
    return (result?.results || [])
      .map((tag) => ({
        // `name` follows the interface locale (for example `tier` in German),
        // while `slug` remains the stable tag identifier (`animal`). Keep both:
        // the form submits the name Discourse returned, but translations must
        // be looked up with a locale-independent key.
        name: tag.name || tag.text || tag.slug,
        slug: tag.slug || tag.name || tag.text,
      }))
      .filter((tag) => tag.name && tag.slug);
  } catch {
    return [];
  }
}

// Both critique forms offer the same tag group and therefore share one set of
// translations. The key stays `critique_form.subjects.*` for the project form
// too: re-keying it would have thrown away translations that already exist to
// describe exactly these tags.
export function subjectOptions(tags, selected) {
  return tags.map((tag) => {
    // Accept strings too so this helper remains compatible with callers or
    // cached data created before fetchSubjectTags started returning both parts.
    const value = typeof tag === "string" ? tag : tag.name;
    const slug = typeof tag === "string" ? tag : tag.slug;
    const key = themePrefix(`critique_form.subjects.${slug}`);
    return {
      value,
      label: I18n.t(key, { defaultValue: value }),
      selected: value === selected,
    };
  });
}

// Where a form's cancel button goes. Discourse resolves /c/<id> on its own, so
// the slug is decoration — but it is the URL every other link on the site uses,
// and landing on a different one makes the back button behave oddly. The slug
// comes from the live category, never from a setting, so a slug rename in
// category admin is followed automatically.
export function categoryUrlFor(id) {
  const categoryId = parseInt(id, 10);
  const slug = (Category.findById(categoryId)?.slug || "").trim();
  return slug ? `/c/${slug}/${categoryId}` : `/c/${categoryId}`;
}

// Discourse localizes a tag's display name but keeps its stable API identity in
// `slug`. For example, German serializes the August round as
// { name: "2026-08-tiere", slug: "2026-08-animals" }. Keep both values all the
// way to the form: the name is user-facing, while posts and comparisons must use
// the slug or Discourse rejects the localized name against category tag rules.
export function tagDisplayName(tag) {
  if (typeof tag === "string") {
    return tag;
  }
  return tag?.name || tag?.text || tag?.slug || "";
}

export function tagCanonicalName(tag) {
  if (typeof tag === "string") {
    return tag;
  }
  return (
    tag?.slug ||
    (typeof tag?.id === "string" ? tag.id : "") ||
    tag?.name ||
    tag?.text ||
    ""
  );
}

export function sameTag(left, right) {
  const leftNames = new Set(
    [tagCanonicalName(left), tagDisplayName(left)].filter(Boolean)
  );
  return [tagCanonicalName(right), tagDisplayName(right)].some((name) =>
    leftNames.has(name)
  );
}

// Current month as YYYY-MM in the club's timezone
export function currentMonthYM() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: settings.challenge_timezone || "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}`;
}

// Resolve the active round tag:
// 1. a non-empty round_tag setting wins (the fixed override)
// 2. otherwise the pinned brief's round tag, when it belongs to the current
//    month — the hero resolves the round from the pinned brief, so the form
//    must read the same source or the two can disagree whenever several tags
//    share a month prefix
// 3. otherwise search the challenge category's tags for one starting with
//    the current month (e.g. "2026-07-cityscapes")
// 4. fall back to plain YYYY-MM
//
// Returns the tag object when Discourse supplied one. Its localized `name` is
// for display; callers that write or compare tags must use tagCanonicalName().
export async function resolveRoundTag(settings) {
  if (settings.round_tag?.trim()) {
    return settings.round_tag.trim();
  }

  const base = currentMonthYM();
  const belongsToRound = (tag) =>
    [tagDisplayName(tag), tagCanonicalName(tag)].some((name) =>
      name.startsWith(base)
    );

  try {
    const data = await ajax(
      `/c/${parseInt(settings.challenge_category_id, 10)}/l/latest.json`
    );
    const pinnedTag = (data?.topic_list?.topics || [])
      .filter((topic) => topic.pinned || topic.unpinned)
      .flatMap((topic) => topic.tags || [])
      .find(belongsToRound);
    if (pinnedTag) {
      return pinnedTag;
    }
  } catch {
    // fall through to the tag search
  }

  try {
    const res = await ajax("/tags/filter/search.json", {
      data: {
        q: base,
        categoryId: parseInt(settings.challenge_category_id, 10),
      },
    });
    const tags = (res.results || [])
      .filter(belongsToRound)
      .sort((a, b) =>
        tagCanonicalName(a).localeCompare(tagCanonicalName(b))
      );
    if (tags.length) {
      return (
        tags.find((tag) =>
          [tagDisplayName(tag), tagCanonicalName(tag)].includes(base)
        ) || tags[0]
      );
    }
  } catch {
    // fall through to base
  }
  return base;
}
