// Post format for project / series critique requests.
//
// WARNING: the strings in this file are load-bearing, for the same reason the
// ones in spc-critique.js are — they reproduce the `post_template` of the
// Custom Wizard "projekt-zur-kritik-einreichen" (and its -en / -fr siblings)
// exactly, so a post made by this form and a post made by the wizard are
// byte-compatible. The wizard stays live as the rollback, so both keep
// producing posts for as long as that is true.
//
// Read the wizard's template at /admin/wizards/wizard/<id>.json signed in as
// admin — /w/<slug>.json does not carry it. See CLAUDE.md.
//
// Since 2026-08-11 these posts ARE parsed: parseProjectRequest() in
// lib/spc-parse-request.js detects the blockquote marker and matches every
// heading below LITERALLY, exactly the way the image critique's strings are
// matched. Changing a marker, key or heading here without changing it there
// makes the Critique Workspace render empty sections with no error.
//
// Only the *descriptions* of the dropdown options are translatable — see the
// `project_form.*` namespace in the locale files.

import I18n from "discourse-i18n";
// Same three-way resolution the image critique uses, and deliberately the same
// function: both forms post into the critique category and both follow the
// wizard's -en / -fr suffix convention, so a project post and an image post
// made in the same session must never disagree about which language they are.
import { critiqueLocale as projectLocale } from "./spc-critique";

export { projectLocale };

// The marker that opens the blockquote, and the two inline keys after it. The
// French keys keep the space before the colon that French typography requires,
// inside the bold span, exactly as the wizard emits them.
const KEYS = {
  de: {
    marker: "Projekt-Kritik",
    focus: "Feedback-Fokus:",
    presentation: "Präsentation:",
  },
  en: {
    marker: "Project critique",
    focus: "Feedback focus:",
    presentation: "Presentation:",
  },
  fr: {
    marker: "Critique de projet",
    focus: "Focus du feedback :",
    presentation: "Présentation :",
  },
};

// Straight apostrophes throughout, because that is what the wizard templates
// contain. Do not let an editor curl them.
const HEADINGS = {
  de: {
    about: "Worum es geht",
    direction: "Kreative Richtung",
    working: "Was funktioniert, was noch nicht",
    help: "Wobei die Community helfen soll",
    details: "Weitere Details",
  },
  en: {
    about: "What it's about",
    direction: "Creative direction",
    working: "What works, what doesn't yet",
    help: "Where the community can help",
    details: "Further details",
  },
  fr: {
    about: "De quoi il s'agit",
    direction: "Direction créative",
    working: "Ce qui fonctionne, ce qui ne fonctionne pas encore",
    help: "Où la communauté peut aider",
    details: "Autres détails",
  },
};

// The dropdown values, in the wizard's order. These are the wizard's option
// *keys* — the side that lands in the post. The wizard's value side is the long
// explanatory label, which lives in locales/*.yml under project_form.* so a
// translator can improve it without touching what gets posted.
const FOCUS_SLUGS = ["artistic", "technical", "both"];
const PRESENTATION_SLUGS = ["print", "exhibition", "web", "social", "open"];

const FOCUS_VALUES = {
  de: ["Künstlerisch / Konzeptionell", "Technik / Präsentation", "Beides"],
  en: ["Artistic / Conceptual", "Technical / Presentation", "Both"],
  fr: ["Artistique / Conceptuel", "Technique / Présentation", "Les deux"],
};

const PRESENTATION_VALUES = {
  de: ["Druck / Buch", "Ausstellung", "Web / Portfolio", "Social Media", "Noch offen"],
  en: ["Print / Book", "Exhibition", "Web / Portfolio", "Social Media", "Still open"],
  fr: [
    "Impression / Livre",
    "Exposition",
    "Web / Portfolio",
    "Réseaux sociaux",
    "Encore ouvert",
  ],
};

const SETS = {
  focus: { slugs: FOCUS_SLUGS, values: FOCUS_VALUES },
  presentation: { slugs: PRESENTATION_SLUGS, values: PRESENTATION_VALUES },
};

// `kind` is "focus" or "presentation". Returns [{ value, label }] where value
// goes in the post and label is shown in the dropdown, falling back to the bare
// value if a translation is missing.
export function projectChoices(kind, locale = projectLocale()) {
  const set = SETS[kind];
  return set.slugs.map((slug, index) => {
    const value = set.values[locale][index];
    const key = themePrefix(`project_form.${kind}.${slug}`);
    const label = I18n.t(key);
    return {
      value,
      label: label && label !== key ? label : value,
    };
  });
}

// Mirrors the wizard's Liquid template: the project content, then a one-line
// blockquote carrying the marker and the two dropdowns, then four required
// sections and one optional one. The wizard omits an empty "Weitere Details"
// entirely rather than leaving a bare heading, so this does too.
//
// Note what is NOT conditional here. Four of the five sections are required in
// the wizard and unconditional in its template, so an empty one would emit a
// heading with nothing under it. validate() is what keeps that from happening;
// this function reproduces the template, it does not second-guess it.
export function buildProjectRaw({
  content,
  focus,
  presentation,
  description,
  direction,
  working,
  help,
  details,
  locale = projectLocale(),
}) {
  const keys = KEYS[locale];
  const headings = HEADINGS[locale];

  // Every interpolation is trimmed; the wizard's Liquid is not. That is the one
  // deliberate deviation, shared with buildCritiqueRaw(), and it only shows up
  // for input the wizard would have emitted with trailing blank lines — which
  // renders identically and reads worse in the raw. For already-trimmed input
  // the two are byte-for-byte, which is the property that matters.
  let raw = content.trim();
  raw += `\n\n> **${keys.marker}** – **${keys.focus}** ${focus}`;
  raw += ` – **${keys.presentation}** ${presentation}`;
  raw += `\n\n## ${headings.about}\n\n${description.trim()}`;
  raw += `\n\n## ${headings.direction}\n\n${direction.trim()}`;
  raw += `\n\n## ${headings.working}\n\n${working.trim()}`;
  raw += `\n\n## ${headings.help}\n\n${help.trim()}`;

  if (details?.trim()) {
    raw += `\n\n## ${headings.details}\n\n${details.trim()}`;
  }

  return raw;
}
