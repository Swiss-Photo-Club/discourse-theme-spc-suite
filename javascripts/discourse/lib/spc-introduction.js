// Post format for member introductions.
//
// WARNING: the strings in this file are load-bearing, for the same reason the
// ones in spc-critique.js and spc-project.js are — they reproduce the
// `post_template` of the Custom Wizard "vorstellung-einreichen" (and its -en /
// -fr siblings) exactly, so a post made by this form and one made by the wizard
// are byte-compatible.
//
// Read the wizard's template at /admin/wizards/wizard/<id>.json signed in as
// admin — /w/<slug>.json does not carry it. See CLAUDE.md.
//
// Nothing parses these posts: spc-parse-request.js only knows the image
// critique's headings, and category 12 is not in workspace_enabled_categories.
// They are reproduced anyway so that every introduction on the site reads the
// same way, whichever thing made it.

// Same three-way resolution the critique forms use, and deliberately the same
// function — a member switching language mid-session must not get a German
// heading on an English introduction.
import { critiqueLocale as introductionLocale } from "./spc-critique";

export { introductionLocale };

// Straight apostrophes, because that is what the wizard templates contain.
const HEADINGS = {
  de: {
    about: "Über mich",
    goals: "Was ich hier entdecken möchte",
  },
  en: {
    about: "About me",
    goals: "What I'm hoping to explore",
  },
  fr: {
    about: "À propos de moi",
    goals: "Ce que j'aimerais découvrir",
  },
};

// The wizard writes a bare `![filename](short_url)` — no `|WxH` — which is NOT
// what core's getUploadMarkdown() produces for an image. Reproduced as the
// wizard had it: that is the exact markdown every existing introduction on this
// site carries, so it is the form demonstrably known to render correctly here.
export function introductionImageMarkdown(upload) {
  if (!upload) {
    return "";
  }
  return `![${upload.original_filename}](${upload.short_url})`;
}

// Mirrors the wizard's Liquid template: an optional image, the required "about"
// section, then an optional "goals" section. The wizard omits an empty optional
// section entirely rather than leaving a bare heading, so this does too.
export function buildIntroductionRaw({
  upload,
  about,
  goals,
  locale = introductionLocale(),
}) {
  const headings = HEADINGS[locale];
  const image = introductionImageMarkdown(upload);

  let raw = image ? `${image}\n\n` : "";
  raw += `## ${headings.about}\n\n${about.trim()}`;

  if (goals?.trim()) {
    raw += `\n\n## ${headings.goals}\n\n${goals.trim()}`;
  }

  return raw;
}
