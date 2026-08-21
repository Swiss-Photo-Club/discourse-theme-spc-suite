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

function cookedRoot(cooked) {
  if (!cooked) {
    return null;
  }
  return new DOMParser().parseFromString(cooked, "text/html").body;
}

// Localized posts deliberately keep `raw` in the author's original language;
// Discourse exposes the translation through `cooked` instead. Translation can
// legitimately phrase a heading differently from the form template (for
// example "What I would like feedback on" instead of "Where I'd like
// feedback"), so cooked parsing follows the form's stable element order, not
// translated labels.
function cookedRequestBlock(root) {
  return [...root.querySelectorAll("blockquote")].find(
    (block) =>
      !block.closest("aside.quote") &&
      block.querySelectorAll("strong").length === 3
  );
}

function cookedFieldValues(root) {
  const requestBlock = cookedRequestBlock(root);
  if (!requestBlock) {
    return [];
  }

  return [...requestBlock.querySelectorAll("strong")].map((field) => {
    let value = "";
    for (let node = field.nextSibling; node; node = node.nextSibling) {
      if (node.nodeType === 1 && node.matches("strong")) {
        break;
      }
      value += node.textContent || "";
    }

    value = value
      .replace(/^[:\s]+/, "")
      .replace(/[\s:–—-]+$/, "")
      .trim();
    return value || null;
  });
}

function cookedSectionValues(root) {
  const requestBlock = cookedRequestBlock(root);
  if (!requestBlock) {
    return [];
  }

  const headings = [];
  for (
    let node = requestBlock.nextElementSibling;
    node;
    node = node.nextElementSibling
  ) {
    if (node.tagName === "H2") {
      headings.push(node);
    }
  }

  return headings.map((heading) => {
    const parts = [];
    for (
      let node = heading.nextElementSibling;
      node && node.tagName !== "H2";
      node = node.nextElementSibling
    ) {
      const value = (node.textContent || "").trim();
      if (value) {
        parts.push(value);
      }
    }
    return parts.join("\n\n") || null;
  });
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

// `original` is the raw parse of the same post: it says which optional
// sections the form emitted, which is the only way to tell the translated
// H2s apart. The translated processing answer is deliberately not returned —
// nothing displays it, and processingExamplesDenied() matches the form's own
// de/en/fr answers, which a free-form translation ("Not allowed") can miss.
export function parseCookedRequest(cooked, original = {}) {
  const root = cookedRoot(cooked);
  if (!root) {
    return {};
  }

  const fields = cookedFieldValues(root);
  const sections = cookedSectionValues(root);
  const result = {
    style: fields[0] || null,
    focus: fields[1] || null,
    about: null,
    feedback: null,
    technical: null,
  };

  // Feedback is the only mandatory image-critique section. If the cooked H2
  // count disagrees with the raw parse (a manually edited post), positional
  // mapping would put the wrong text in the highlight slot — keep the
  // original sections instead.
  const expected = 1 + (original.about ? 1 : 0) + (original.technical ? 1 : 0);
  if (sections.length !== expected) {
    return result;
  }

  let sectionIndex = 0;
  result.about = original.about ? sections[sectionIndex++] || null : null;
  result.feedback = sections[sectionIndex++] || null;
  result.technical = original.technical
    ? sections[sectionIndex] || null
    : null;
  return result;
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

export function parseCookedProjectRequest(cooked, original = {}) {
  const root = cookedRoot(cooked);
  if (!root) {
    return null;
  }

  const fields = cookedFieldValues(root);
  const sections = cookedSectionValues(root);
  // A project has its marker plus focus and presentation in the blockquote,
  // followed by four mandatory sections and an optional details section.
  // Refuse any other translated shape so the caller keeps the complete
  // original request rather than positionally misassigned text.
  const expected = 4 + (original.details ? 1 : 0);
  if (fields.length < 3 || sections.length !== expected) {
    return null;
  }

  return {
    focus: fields[1] || null,
    presentation: fields[2] || null,
    about: sections[0] || null,
    direction: sections[1] || null,
    working: sections[2] || null,
    help: sections[3] || null,
    details: original.details ? sections[4] || null : null,
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
