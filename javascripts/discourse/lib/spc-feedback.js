// Post format for website feedback (category `feedback_category_id`).
//
// Unlike spc-critique.js and spc-project.js, nothing parses these posts and no
// wizard ever produced them, so the strings here are NOT load-bearing. They live
// in JS anyway so that all four /submit/* post formats are found in the same
// place and built the same way, and so that the tag values below can never be
// "translated" by a locale edit: the tags are what the category requires and
// what staff filter by, and Discourse matches them by name.

import { getUploadMarkdown } from "discourse/lib/uploads";
import { critiqueLocale as feedbackLocale } from "./spc-critique";

export { feedbackLocale };

// One tag per topic from the "Feedback Type" tag group, which the category
// requires (min 1) and restricts to exactly these three. Their order here is
// the order the cards render in.
export const FEEDBACK_TYPES = ["idea", "problem", "question"];

// The one line of structure the post carries besides the free text: where on
// the site the feedback applies. Written as a bold key so it reads the same way
// the critique metadata does, and stays greppable.
const WHERE = {
  de: "Wo:",
  en: "Where:",
  fr: "Où :",
};

// Details first, so the topic excerpt in the list is the feedback itself and
// not a location line; then the optional location; then the optional
// screenshot. Every optional part is omitted entirely rather than left as an
// empty key, the same rule the introduction format follows.
export function buildFeedbackRaw({
  details,
  where,
  upload,
  locale = feedbackLocale(),
}) {
  const parts = [details.trim()];

  if (where?.trim()) {
    parts.push(`**${WHERE[locale]}** ${where.trim()}`);
  }

  if (upload) {
    parts.push(getUploadMarkdown(upload));
  }

  return parts.join("\n\n");
}
