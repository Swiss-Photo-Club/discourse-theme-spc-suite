import { ajax } from "discourse/lib/ajax";

// Current month as YYYY-MM in the club's timezone
export function currentMonthYM() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  return `${y}-${m}`;
}

// Resolve the active round tag:
// 1. fixed setting wins
// 2. otherwise search the challenge category's tags for one starting with
//    the current month (e.g. "2026-07-cityscapes")
// 3. fall back to plain YYYY-MM
export async function resolveRoundTag(settings) {
  if (settings.round_tag_mode === "fixed" && settings.round_tag?.trim()) {
    return settings.round_tag.trim();
  }

  const base = currentMonthYM();
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
