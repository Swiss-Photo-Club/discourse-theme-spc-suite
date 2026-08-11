// Parses a critique submission post (created by the SPC submit forms) into
// its structured parts. Works for the German, English and French templates,
// for both the single-image critique and — via parseProjectRequest() — the
// project critique.
//
// The project markers, keys and headings below mirror lib/spc-project.js the
// same way the image-critique strings mirror lib/spc-critique.js: change a
// heading there without changing it here and the workspace renders empty
// sections with no error. The curly-apostrophe variants exist because a
// photographer editing their post in Discourse's editor can end up with
// typographic quotes; the wizard and the form both emit straight ones.

const STYLE_KEYS = ["Kritik-Stil", "Critique style", "Style de critique"];
const FOCUS_KEYS = ["Feedback-Fokus", "Feedback focus", "Focus du feedback"];
const PRESENTATION_KEYS = ["Präsentation", "Presentation", "Présentation"];

const PROJECT_MARKERS = [
  "Projekt-Kritik",
  "Project critique",
  "Critique de projet",
];

const PROJECT_ABOUT = [
  "Worum es geht",
  "What it's about",
  "What it’s about",
  "De quoi il s'agit",
  "De quoi il s’agit",
];
const PROJECT_DIRECTION = [
  "Kreative Richtung",
  "Creative direction",
  "Direction créative",
];
const PROJECT_WORKING = [
  "Was funktioniert, was noch nicht",
  "What works, what doesn't yet",
  "What works, what doesn’t yet",
  "Ce qui fonctionne, ce qui ne fonctionne pas encore",
];
const PROJECT_HELP = [
  "Wobei die Community helfen soll",
  "Where the community can help",
  "Où la communauté peut aider",
];
const PROJECT_DETAILS = [
  "Weitere Details",
  "Further details",
  "Autres détails",
];
const EDIT_KEYS = [
  "Bearbeitungsbeispiele erlaubt",
  "Processing examples allowed",
  "Exemples de retouche autorisés",
];

const ABOUT_HEADINGS = [
  "Über dieses Bild",
  "About this image",
  "À propos de cette image",
];
const FEEDBACK_HEADINGS = [
  "Wo ich mir Feedback wünsche",
  "Where I'd like feedback",
  "Where I’d like feedback",
  "Où j'aimerais du feedback",
  "Où j’aimerais du feedback",
];
const TECH_HEADINGS = [
  "Technische Details",
  "Technical details",
  "Détails techniques",
];

function quoteValue(raw, keys) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Stop at the first `*`: wizard-era posts carried further bold fields on
    // the same line ("Both – **Presentation:** Web / Portfolio"), and none of
    // the legitimate values contain an asterisk. The trailing strip removes
    // the separator left behind ("Both – " → "Both").
    const re = new RegExp(
      `\\*\\*${escaped}\\s*:?\\s*\\*\\*\\s*:?\\s*([^*\\n]+)`,
      "i"
    );
    const match = raw.match(re);
    if (match) {
      const value = match[1]
        .replace(/^[:\s]+/, "")
        .replace(/[\s:–—-]+$/, "")
        .trim();
      return value || null;
    }
  }
  return null;
}

function section(raw, headings) {
  const parts = raw.split(/^##\s+/m);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf("\n");
    const title = (newline === -1 ? part : part.slice(0, newline)).trim();
    if (headings.some((h) => h.toLowerCase() === title.toLowerCase())) {
      const body = newline === -1 ? "" : part.slice(newline + 1);
      return body.trim() || null;
    }
  }
  return null;
}

export default function parseRequest(raw) {
  if (!raw) {
    return {};
  }
  return {
    style: quoteValue(raw, STYLE_KEYS),
    focus: quoteValue(raw, FOCUS_KEYS),
    processingAllowed: quoteValue(raw, EDIT_KEYS),
    about: section(raw, ABOUT_HEADINGS),
    feedback: section(raw, FEEDBACK_HEADINGS),
    technical: section(raw, TECH_HEADINGS),
  };
}

// A project post opens its blockquote with a bold marker in the post's
// language — the one line every project post carries and no image post does.
export function isProjectRequest(raw) {
  if (!raw) {
    return false;
  }
  return PROJECT_MARKERS.some((marker) => raw.includes(`**${marker}**`));
}

// Returns null for non-project posts. The focus rides on the same
// "Feedback focus" key as the image critique, on the marker line; the
// presentation follows it on that line too, so both go through quoteValue's
// stop-at-asterisk capture.
export function parseProjectRequest(raw) {
  if (!isProjectRequest(raw)) {
    return null;
  }
  return {
    focus: quoteValue(raw, FOCUS_KEYS),
    presentation: quoteValue(raw, PRESENTATION_KEYS),
    about: section(raw, PROJECT_ABOUT),
    direction: section(raw, PROJECT_DIRECTION),
    working: section(raw, PROJECT_WORKING),
    help: section(raw, PROJECT_HELP),
    details: section(raw, PROJECT_DETAILS),
  };
}

// The examples answer is in the POST's language, not the viewer's, so all
// three forms must match. Only an explicit "no" denies: legacy posts without
// the field (and free-form answers) keep the uploader available and leave the
// judgement to the critic.
export function processingExamplesDenied(value) {
  return /^(nein|no|non)\b/i.test((value || "").trim());
}

export function questionKeysFor(focus) {
  const value = (focus || "").toLowerCase();
  if (/technik|technical|technique/.test(value) && !/\+|und|and|et/.test(value)) {
    return [
      "critique_workspace.q_technical_1",
      "critique_workspace.q_technical_2",
      "critique_workspace.q_technical_3",
    ];
  }
  if (/künstlerisch|artistic|artistique|expressiv|expressive/.test(value)) {
    return [
      "critique_workspace.q_artistic_1",
      "critique_workspace.q_artistic_2",
      "critique_workspace.q_artistic_3",
    ];
  }
  return [
    "critique_workspace.q_general_1",
    "critique_workspace.q_general_2",
    "critique_workspace.q_general_3",
  ];
}
