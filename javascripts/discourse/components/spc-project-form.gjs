import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { getUploadMarkdown } from "discourse/lib/uploads";
import { i18n } from "discourse-i18n";
import {
  buildProjectRaw,
  projectChoices,
  projectLocale,
} from "../lib/spc-project";
import SpcSubmitBase from "../lib/spc-submit-base";
import {
  categoryUrlFor,
  fetchSubjectTags,
  subjectOptions,
} from "../lib/spc-submit-helpers";
import SpcSubmitShell from "./spc-submit-shell";

function withSelection(choices, current) {
  return choices.map((choice) => ({
    ...choice,
    selected: choice.value === current,
  }));
}

// Submit a project or series for critique — the replacement for the Custom
// Wizard "projekt-zur-kritik-einreichen". Posts into the same category as the
// single-image critique and carries the same subject tags; see lib/spc-project.js
// for why its output has to stay byte-compatible with that wizard.
//
// The wizard's `step_1_inhalt` was a full composer field: markdown, drag-and-
// drop images, a PDF, a link. This is a list of image uploaders plus a free-text
// box instead. d-editor turns out to carry no upload handling of its own — the
// composer's uploads come from wiring the wizard reproduces by subclassing
// ComposerEditor and reaching into uppyComposerUpload's internals, against a
// d-editor core has since rewritten. Copying that into a theme with no build and
// no tests trades a fragile thing for the same fragile thing. The list keeps the
// three forms looking alike, which is the point of the port, and the free-text
// box keeps the wizard's "or just share a link to your project" path open.

export default class SpcProjectForm extends SpcSubmitBase {
  // Every image is one entry with a stable key. Keys matter: the uploaders are
  // rendered from this list, and reusing one for a different image after a
  // delete would leave the previous preview on screen.
  @tracked entries = [];
  @tracked blankKey = "blank-0";
  #nextKey = 0;
  #nextBlank = 0;

  @tracked contentText = "";
  @tracked subjects = [];
  @tracked subject = "";
  @tracked focus = "";
  @tracked presentation = "";
  @tracked description = "";
  @tracked direction = "";
  @tracked working = "";
  @tracked help = "";
  @tracked details = "";

  constructor() {
    super(...arguments);
    fetchSubjectTags(this.categoryId).then((tags) => (this.subjects = tags));
  }

  get categoryId() {
    return parseInt(settings.critique_category_id, 10);
  }

  get categoryUrl() {
    return categoryUrlFor(settings.critique_category_slug, this.categoryId);
  }

  get heading() {
    return i18n(themePrefix("project_form.heading"));
  }

  get submitLabel() {
    return i18n(themePrefix("project_form.submit"));
  }

  // The base's default asks for a title for your photo, which is the wrong noun
  // on a form that submits a series.
  get titleError() {
    return this.missing("title_label");
  }

  // One uploader per image, plus a trailing empty one to add the next.
  get uploadSlots() {
    return [
      ...this.entries,
      { key: this.blankKey, upload: null, blank: true },
    ];
  }

  get images() {
    return this.entries.map((entry) => getUploadMarkdown(entry.upload));
  }

  get subjectChoices() {
    return subjectOptions(this.subjects, this.subject);
  }

  get noSubject() {
    return !this.subject;
  }

  get noFocus() {
    return !this.focus;
  }

  get noPresentation() {
    return !this.presentation;
  }

  get focusChoices() {
    return withSelection(projectChoices("focus"), this.focus);
  }

  get presentationChoices() {
    return withSelection(projectChoices("presentation"), this.presentation);
  }

  get dirtyFields() {
    return [
      this.title,
      this.contentText,
      this.description,
      this.direction,
      this.working,
      this.help,
      this.details,
      this.entries.length,
    ];
  }

  @action
  slotUploadDone(key, upload) {
    if (key === this.blankKey) {
      this.entries = [...this.entries, { key: `img-${this.#nextKey++}`, upload }];
      this.blankKey = `blank-${++this.#nextBlank}`;
    } else {
      this.entries = this.entries.map((entry) =>
        entry.key === key ? { ...entry, upload } : entry
      );
    }
    this.error = null;
  }

  @action
  slotUploadDeleted(key) {
    this.entries = this.entries.filter((entry) => entry.key !== key);
  }

  @action
  updateField(name, event) {
    this[name] = event.target.value;
  }

  async resolveTags() {
    return [this.subject];
  }

  // The wizard's content field takes images, a PDF or a link, so this reproduces
  // "at least one of the two" rather than requiring an image. Images first, then
  // whatever was typed, which is the order the composer field produced.
  get content() {
    return [...this.images, this.contentText.trim()]
      .filter(Boolean)
      .join("\n\n");
  }

  buildRaw() {
    return buildProjectRaw({
      content: this.content,
      focus: this.focus,
      presentation: this.presentation,
      description: this.description,
      direction: this.direction,
      working: this.working,
      help: this.help,
      details: this.details,
      locale: projectLocale(),
    });
  }

  // Every field the wizard marked required is required here, and the message
  // names the field rather than each one carrying its own string — the labels
  // are already translated, so one message keeps the locale block honest.
  missing(labelKey) {
    return i18n(themePrefix("project_form.error_missing"), {
      field: i18n(themePrefix(`project_form.${labelKey}`)),
    });
  }

  validate() {
    const problem = super.validate();
    if (problem) {
      return problem;
    }
    if (!this.content) {
      return i18n(themePrefix("project_form.error_no_content"));
    }
    if (!this.subject) {
      return this.missing("subject_label");
    }
    if (!this.focus) {
      return this.missing("focus_label");
    }
    if (!this.description?.trim()) {
      return this.missing("description_label");
    }
    if (!this.direction?.trim()) {
      return this.missing("direction_label");
    }
    if (!this.working?.trim()) {
      return this.missing("working_label");
    }
    if (!this.help?.trim()) {
      return this.missing("help_label");
    }
    if (!this.presentation) {
      return this.missing("presentation_label");
    }
    return null;
  }

  <template>
    <SpcSubmitShell
      @heading={{this.heading}}
      @submitLabel={{this.submitLabel}}
      @submitting={{this.submitting}}
      @error={{this.error}}
      @onSubmit={{this.submit}}
      @onCancel={{this.cancel}}
    >
      <:fields>
        <div class="spc-submit-page__intro">
          <h2>{{i18n (themePrefix "project_form.intro_title")}}</h2>
          <p>{{i18n (themePrefix "project_form.intro_body")}}</p>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-title">
            {{i18n (themePrefix "project_form.title_label")}}
          </label>
          <input
            id="spc-project-title"
            type="text"
            maxlength="255"
            value={{this.title}}
            placeholder={{i18n (themePrefix "project_form.title_placeholder")}}
            {{on "input" this.updateTitle}}
          />
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-description">
            {{i18n (themePrefix "project_form.description_label")}}
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "project_form.description_hint")}}
          </p>
          <textarea
            id="spc-project-description"
            rows="4"
            {{on "input" (fn this.updateField "description")}}
          >{{this.description}}</textarea>
        </div>

        <div class="spc-submit-page__field">
          <label>{{i18n (themePrefix "project_form.content_label")}}</label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "project_form.content_hint")}}
          </p>

          <div class="spc-submit-page__uploads">
            {{#each this.uploadSlots key="key" as |slot|}}
              <UppyImageUploader
                @id="spc-project-upload-{{slot.key}}"
                @type="composer"
                @imageUrl={{slot.upload.url}}
                @onUploadDone={{fn this.slotUploadDone slot.key}}
                @onUploadDeleted={{fn this.slotUploadDeleted slot.key}}
                class="spc-submit-page__uploader"
              />
            {{/each}}
          </div>

          <textarea
            id="spc-project-content-text"
            rows="3"
            placeholder={{i18n (themePrefix "project_form.content_placeholder")}}
            {{on "input" (fn this.updateField "contentText")}}
          >{{this.contentText}}</textarea>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-subject">
            {{i18n (themePrefix "project_form.subject_label")}}
          </label>
          {{! The block param must not be called `option` - see the note in
              spc-submit-form.gjs for what that costs. }}
          <select
            id="spc-project-subject"
            {{on "change" (fn this.updateField "subject")}}
          >
            <option value="" selected={{this.noSubject}}>
              {{i18n (themePrefix "project_form.subject_placeholder")}}
            </option>
            {{#each this.subjectChoices as |choice|}}
              <option value={{choice.value}} selected={{choice.selected}}>
                {{choice.label}}
              </option>
            {{/each}}
          </select>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-focus">
            {{i18n (themePrefix "project_form.focus_label")}}
          </label>
          <select
            id="spc-project-focus"
            {{on "change" (fn this.updateField "focus")}}
          >
            <option value="" selected={{this.noFocus}}>
              {{i18n (themePrefix "project_form.focus_placeholder")}}
            </option>
            {{#each this.focusChoices as |choice|}}
              <option value={{choice.value}} selected={{choice.selected}}>
                {{choice.label}}
              </option>
            {{/each}}
          </select>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-direction">
            {{i18n (themePrefix "project_form.direction_label")}}
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "project_form.direction_hint")}}
          </p>
          <textarea
            id="spc-project-direction"
            rows="4"
            {{on "input" (fn this.updateField "direction")}}
          >{{this.direction}}</textarea>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-working">
            {{i18n (themePrefix "project_form.working_label")}}
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "project_form.working_hint")}}
          </p>
          <textarea
            id="spc-project-working"
            rows="4"
            {{on "input" (fn this.updateField "working")}}
          >{{this.working}}</textarea>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-help">
            {{i18n (themePrefix "project_form.help_label")}}
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "project_form.help_hint")}}
          </p>
          <textarea
            id="spc-project-help"
            rows="4"
            {{on "input" (fn this.updateField "help")}}
          >{{this.help}}</textarea>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-presentation">
            {{i18n (themePrefix "project_form.presentation_label")}}
          </label>
          <select
            id="spc-project-presentation"
            {{on "change" (fn this.updateField "presentation")}}
          >
            <option value="" selected={{this.noPresentation}}>
              {{i18n (themePrefix "project_form.presentation_placeholder")}}
            </option>
            {{#each this.presentationChoices as |choice|}}
              <option value={{choice.value}} selected={{choice.selected}}>
                {{choice.label}}
              </option>
            {{/each}}
          </select>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-project-details">
            {{i18n (themePrefix "project_form.details_label")}}
          </label>
          <textarea
            id="spc-project-details"
            rows="3"
            {{on "input" (fn this.updateField "details")}}
          >{{this.details}}</textarea>
        </div>
      </:fields>
    </SpcSubmitShell>
  </template>
}
