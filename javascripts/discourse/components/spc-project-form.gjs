import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
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
import SpcCardChoice from "./spc-card-choice";
import SpcFormSection from "./spc-form-section";
import SpcImageList from "./spc-image-list";
import SpcSubmitShell from "./spc-submit-shell";

// Submit a project or series for critique — the replacement for the Custom
// Wizard "projekt-zur-kritik-einreichen". Posts into the same category as the
// single-image critique and carries the same subject tags; see lib/spc-project.js
// for why its output has to stay byte-compatible with that wizard.
//
// The wizard's `step_1_inhalt` was one composer field that was meant to accept
// images, a PDF or a link interchangeably. Here those are explicit modes chosen
// up front — clearer, and honest about the fact that they are different things.
// d-editor was the obvious way to keep the composer and turns out to carry no
// upload handling at all: the composer's uploads come from wiring the wizard
// reproduces by subclassing ComposerEditor and reaching into uppyComposerUpload's
// private internals, against a d-editor core has since rewritten and moved to
// ui-kit.
//
// There is no PDF mode. The site's authorized_extensions lists only image
// formats, so a PDF upload has always been rejected server side — the wizard's
// PDF path has never worked on this install. Adding one back means adding `pdf`
// to that site setting first, and it is a site-wide change: it would let PDFs be
// attached to any post anywhere, not only here.

const SUBMISSION_TYPES = ["images", "link"];

// The one thing that tells a project apart from a single image once it is in
// the list. Everything else about the two posts is the same shape — same
// category, same subject tags, one thumbnail each — and the difference is
// otherwise only visible inside the post body, which a topic list never reads.
//
// A tag rather than anything derived from the post, so the distinction is data:
// it shows on the topic page and in search, it is what scss/topic-cards.scss
// keys the card treatment off (as `tag-project` on the row and
// [data-tag-name="project"] on the chip), and it makes projects filterable.
//
// Not a setting. A setting here would be a rename away from silently detaching
// the CSS from the tag it styles, with no visual symptom on either side until
// someone looks for a chip that never appears — and there is nothing an admin
// would want to change it to. Renaming it means editing both this file and
// topic-cards.scss, and retagging the posts that already carry it.
const PROJECT_TAG = "project";

function withSelection(choices, current) {
  return choices.map((choice) => ({
    ...choice,
    selected: choice.value === current,
  }));
}

export default class SpcProjectForm extends SpcSubmitBase {
  // [{ key, upload, note }], owned here so buildRaw() has one source of truth.
  // SpcImageList renders and mutates it but never keeps a copy.
  @tracked projectImages = [];

  @tracked submissionType = "images";
  @tracked link = "";

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

  get lead() {
    return i18n(themePrefix("project_form.lead"));
  }

  get submitLabel() {
    return i18n(themePrefix("project_form.submit"));
  }

  // The base's default asks for a title for your photo, which is the wrong noun
  // on a form that submits a series.
  get titleError() {
    return this.missing("title_label");
  }

  // ---- submission type -----------------------------------------------------

  get submissionTypeChoices() {
    return SUBMISSION_TYPES.map((type) => ({
      value: type,
      title: i18n(themePrefix(`project_form.types.${type}.title`)),
      description: i18n(themePrefix(`project_form.types.${type}.description`)),
      selected: this.submissionType === type,
    }));
  }

  get uploadingImages() {
    return this.submissionType === "images";
  }

  get sharingLink() {
    return this.submissionType === "link";
  }

  @action
  updateSubmissionType(event) {
    this.submissionType = event.target.value;
    this.error = null;
  }

  // ---- images --------------------------------------------------------------

  @action
  updateImages(images) {
    this.projectImages = images;
    this.error = null;
  }

  // An image, then its note if it has one. The wizard's content field was free
  // markdown, so notes between images are ordinary content and change nothing
  // about the post's structure.
  get imageMarkdown() {
    return this.projectImages
      .map(({ upload, note }) => {
        const markdown = getUploadMarkdown(upload);
        return note?.trim() ? `${markdown}\n\n${note.trim()}` : markdown;
      })
      .join("\n\n");
  }

  // Labels are resolved here rather than in the list component, so that the
  // component carries no strings of its own and the introduction form can reuse
  // it with its own.
  get imageListLabels() {
    return {
      itemLabelKey: themePrefix("project_form.image_number"),
      noteLabel: i18n(themePrefix("project_form.image_note_label")),
      notePlaceholder: i18n(
        themePrefix("project_form.image_note_placeholder")
      ),
      addLabel: themePrefix("project_form.images_add"),
      addMoreLabel: themePrefix("project_form.images_add_more"),
      dropHint: i18n(themePrefix("project_form.images_drop_hint")),
      uploadingLabel: i18n(themePrefix("project_form.images_uploading")),
      moveUpLabel: themePrefix("project_form.image_move_up"),
      moveDownLabel: themePrefix("project_form.image_move_down"),
      removeLabel: themePrefix("project_form.image_remove"),
    };
  }

  // ---- the rest ------------------------------------------------------------

  get subjectChoices() {
    return subjectOptions(this.subjects, this.subject);
  }

  get noSubject() {
    return !this.subject;
  }

  get noPresentation() {
    return !this.presentation;
  }

  // The card's title is the value that lands in the post, straight from the
  // load-bearing table, so a translator cannot make the card disagree with what
  // gets written. Only the description below it is translatable.
  get focusChoices() {
    return projectChoices("focus").map((choice) => ({
      value: choice.value,
      title: choice.value,
      description: choice.label,
      selected: choice.value === this.focus,
    }));
  }

  get presentationChoices() {
    return withSelection(projectChoices("presentation"), this.presentation);
  }

  get dirtyFields() {
    return [
      this.title,
      this.link,
      this.description,
      this.direction,
      this.working,
      this.help,
      this.details,
      this.projectImages.length,
    ];
  }

  @action
  updateField(name, event) {
    this[name] = event.target.value;
  }

  // The subject tag is what the category requires; PROJECT_TAG is what makes
  // the submission recognisable as a series afterwards. Order matters only for
  // display: Discourse renders tags in the order given, so the subject stays
  // first and the chip reads as a qualifier on it rather than replacing it.
  async resolveTags() {
    return [this.subject, PROJECT_TAG];
  }

  // Whichever mode is selected. The other modes keep their state, so switching
  // back and forth to compare does not throw away an upload.
  get content() {
    if (this.sharingLink) {
      return this.link.trim();
    }
    return this.imageMarkdown;
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
      return i18n(
        themePrefix(`project_form.types.${this.submissionType}.error`)
      );
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
      @lead={{this.lead}}
      @submitLabel={{this.submitLabel}}
      @submitting={{this.submitting}}
      @error={{this.error}}
      @onSubmit={{this.submit}}
      @onCancel={{this.cancel}}
    >
      <:fields>
        <details class="spc-submit-page__guidance">
          <summary>{{i18n (themePrefix "project_form.guidance_title")}}</summary>
          <p>{{i18n (themePrefix "project_form.guidance_body")}}</p>
        </details>

        <SpcFormSection
          @title={{i18n (themePrefix "project_form.section_submission")}}
        >
          <div class="spc-submit-page__field">
            <label for="spc-project-title">
              {{i18n (themePrefix "project_form.title_label")}}
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
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
            <label>
              {{i18n (themePrefix "project_form.type_label")}}
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
            </label>
            <SpcCardChoice
              @name="spc-project-type"
              @choices={{this.submissionTypeChoices}}
              @onChange={{this.updateSubmissionType}}
            />

            {{#if this.uploadingImages}}
              <p class="spc-submit-page__hint">
                {{i18n (themePrefix "project_form.images_hint")}}
              </p>
              <SpcImageList
                @id="spc-project-images"
                @images={{this.projectImages}}
                @onChange={{this.updateImages}}
                @itemLabelKey={{this.imageListLabels.itemLabelKey}}
                @noteLabel={{this.imageListLabels.noteLabel}}
                @notePlaceholder={{this.imageListLabels.notePlaceholder}}
                @addLabel={{this.imageListLabels.addLabel}}
                @addMoreLabel={{this.imageListLabels.addMoreLabel}}
                @dropHint={{this.imageListLabels.dropHint}}
                @uploadingLabel={{this.imageListLabels.uploadingLabel}}
                @moveUpLabel={{this.imageListLabels.moveUpLabel}}
                @moveDownLabel={{this.imageListLabels.moveDownLabel}}
                @removeLabel={{this.imageListLabels.removeLabel}}
              />
            {{else}}
              <input
                id="spc-project-link"
                type="url"
                value={{this.link}}
                placeholder={{i18n
                  (themePrefix "project_form.link_placeholder")
                }}
                {{on "input" (fn this.updateField "link")}}
              />
            {{/if}}
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-project-description">
              {{i18n (themePrefix "project_form.description_label")}}
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
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
            <label for="spc-project-subject">
              {{i18n (themePrefix "project_form.subject_label")}}
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
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
        </SpcFormSection>

        <SpcFormSection
          @title={{i18n (themePrefix "project_form.section_direction")}}
          @intro={{i18n (themePrefix "project_form.section_direction_intro")}}
        >
          <div class="spc-submit-page__field">
            <label>
              {{i18n (themePrefix "project_form.focus_label")}}
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
            </label>
            <SpcCardChoice
              @name="spc-project-focus"
              @choices={{this.focusChoices}}
              @onChange={{fn this.updateField "focus"}}
            />
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-project-direction">
              {{i18n (themePrefix "project_form.direction_label")}}
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
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
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
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
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
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
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.required")}}
              </span>
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
              <span class="spc-submit-page__required">
                {{i18n (themePrefix "form.optional")}}
              </span>
            </label>
            <textarea
              id="spc-project-details"
              rows="3"
              {{on "input" (fn this.updateField "details")}}
            >{{this.details}}</textarea>
          </div>
        </SpcFormSection>
      </:fields>
    </SpcSubmitShell>
  </template>
}
