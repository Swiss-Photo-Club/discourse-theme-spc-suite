// Post format for single-image critique requests.
//
// WARNING: the strings in this file are load-bearing in two directions.
//
//  1. lib/spc-parse-request.js matches them *literally* to rebuild a request
//     for the Critique Workspace modal. Change a heading here without changing
//     it there and the modal renders with empty sections and no error.
//  2. They reproduce the `post_template` of the Custom Wizard
//     "bild-zur-kritik-einreichen" (and its -en / -fr siblings) exactly, so a
//     post made by this form and a post made by the wizard are byte-compatible.
//     The three flows have to stay interchangeable while the project and
//     introduction wizards are still live.
//
// This is why they live in JS next to the parser rather than in locales/*.yml:
// a translator editing a locale file must not be able to break the parser.
// Only the *descriptions* of the dropdown options are translatable — see the
// `critique_form.*` namespace in the locale files.

import I18n from "discourse-i18n";

export function critiqueLocale() {
  const locale = I18n.currentLocale() || "";
  if (locale.startsWith("en")) {
    return "en";
  }
  if (locale.startsWith("fr")) {
    return "fr";
  }
  return "de";
}

// Metadata keys as the wizard emits them. French keeps the space before the
// colon (" :") that French typography requires — that space is inside the bold
// span, so it is part of the key the parser sees.
const KEYS = {
  de: {
    style: "Kritik-Stil:",
    focus: "Feedback-Fokus:",
    examples: "Bearbeitungsbeispiele erlaubt:",
  },
  en: {
    style: "Critique style:",
    focus: "Feedback focus:",
    examples: "Processing examples allowed:",
  },
  fr: {
    style: "Style de critique :",
    focus: "Focus du feedback :",
    examples: "Exemples de retouche autorisés :",
  },
};

const HEADINGS = {
  de: {
    about: "Über dieses Bild",
    feedback: "Wo ich mir Feedback wünsche",
    technical: "Technische Details",
  },
  en: {
    about: "About this image",
    feedback: "Where I'd like feedback",
    technical: "Technical details",
  },
  fr: {
    about: "À propos de cette image",
    feedback: "Où j'aimerais du feedback",
    technical: "Détails techniques",
  },
};

// Option values, in the wizard's order. The `slug` is only ever used to look up
// a translated description (`critique_form.styles.<slug>` etc.); the `value` is
// what lands in the post and what questionKeysFor() in spc-parse-request.js
// pattern-matches on.
const STYLE_SLUGS = ["standard", "in_depth", "initial_reaction"];
const FOCUS_SLUGS = ["artistic", "technical", "both"];
const EXAMPLE_SLUGS = ["allowed", "denied"];

const STYLE_VALUES = {
  de: ["Standard", "Ausführlich", "Erster Eindruck"],
  en: ["Standard", "In-Depth", "Initial Reaction"],
  fr: ["Standard", "Approfondie", "Première impression"],
};

const FOCUS_VALUES = {
  de: ["Künstlerisch / Expressiv", "Technik", "Künstlerisch + Technik"],
  en: ["Artistic / Expressive", "Technical", "Artistic + Technical"],
  fr: ["Artistique / Expressif", "Technique", "Artistique + Technique"],
};

const EXAMPLE_VALUES = {
  de: ["Ja", "Nein"],
  en: ["Yes", "No"],
  fr: ["Oui", "Non"],
};

const SETS = {
  styles: { slugs: STYLE_SLUGS, values: STYLE_VALUES },
  focus: { slugs: FOCUS_SLUGS, values: FOCUS_VALUES },
  examples: { slugs: EXAMPLE_SLUGS, values: EXAMPLE_VALUES },
};

// `kind` is one of "styles", "focus", "examples". Returns
// [{ value, label }] where value goes in the post and label is shown in the
// dropdown, falling back to the bare value if a translation is missing.
export function critiqueChoices(kind, locale = critiqueLocale()) {
  const set = SETS[kind];
  return set.slugs.map((slug, index) => {
    const value = set.values[locale][index];
    const key = themePrefix(`critique_form.${kind}.${slug}`);
    const label = I18n.t(key);
    return {
      value,
      label: label && label !== key ? label : value,
    };
  });
}

export function defaultCritiqueValues(locale = critiqueLocale()) {
  return {
    style: STYLE_VALUES[locale][0],
    focus: FOCUS_VALUES[locale][2],
    examples: EXAMPLE_VALUES[locale][1],
  };
}

// Mirrors the wizard's Liquid template: image, then the blockquote of
// metadata, then only the sections that have content. Empty optional sections
// are omitted entirely rather than left as an empty heading — the parser
// treats a heading with no body as absent anyway, but the wizard omits them
// and these posts have to look the same.
export function buildCritiqueRaw({
  imageMarkdown,
  style,
  focus,
  examples,
  about,
  feedback,
  technical,
  locale = critiqueLocale(),
}) {
  const keys = KEYS[locale];
  const headings = HEADINGS[locale];

  let raw = imageMarkdown;
  raw += `\n\n> **${keys.style}** ${style}`;
  raw += `\n> **${keys.focus}** ${focus}`;
  raw += `\n> **${keys.examples}** ${examples}`;

  if (about?.trim()) {
    raw += `\n\n## ${headings.about}\n\n${about.trim()}`;
  }

  raw += `\n\n## ${headings.feedback}\n\n${feedback.trim()}`;

  if (technical?.trim()) {
    raw += `\n\n## ${headings.technical}\n\n${technical.trim()}`;
  }

  return raw;
}
