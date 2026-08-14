import { ajax } from "discourse/lib/ajax";
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
    return (result?.results || []).map((tag) => tag.name).filter(Boolean);
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
    const key = themePrefix(`critique_form.subjects.${tag}`);
    const label = I18n.t(key);
    return {
      value: tag,
      label: label && label !== key ? label : tag,
      selected: tag === selected,
    };
  });
}

// Where a form's cancel button goes. Discourse resolves /c/<id> on its own, so
// the slug is decoration — but it is the URL every other link on the site uses,
// and landing on a different one makes the back button behave oddly.
export function categoryUrlFor(slug, id) {
  const trimmed = (slug || "").trim();
  return trimmed ? `/c/${trimmed}/${id}` : `/c/${id}`;
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
// 1. fixed setting wins
// 2. otherwise the pinned brief's round tag, when it belongs to the current
//    month — the hero resolves the round from the pinned brief, so the form
//    must read the same source or the two can disagree whenever several tags
//    share a month prefix
// 3. otherwise search the challenge category's tags for one starting with
//    the current month (e.g. "2026-07-cityscapes")
// 4. fall back to plain YYYY-MM
export async function resolveRoundTag(settings) {
  if (settings.round_tag_mode === "fixed" && settings.round_tag?.trim()) {
    return settings.round_tag.trim();
  }

  const base = currentMonthYM();
  const readTagName = (tag) =>
    typeof tag === "string" ? tag : tag?.name || "";

  try {
    const data = await ajax(
      `/c/${parseInt(settings.challenge_category_id, 10)}/l/latest.json`
    );
    const pinnedTag = (data?.topic_list?.topics || [])
      .filter((topic) => topic.pinned)
      .flatMap((topic) => (topic.tags || []).map(readTagName))
      .find((tag) => tag.startsWith(base));
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
    const names = (res.results || [])
      .map((r) => r.name || r.id)
      .filter((n) => typeof n === "string" && n.startsWith(base))
      .sort();
    if (names.length) {
      return names.find((n) => n === base) || names[0];
    }
  } catch {
    // fall through to base
  }
  return base;
}
