import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { ajax } from "discourse/lib/ajax";
import { getUploadMarkdown } from "discourse/lib/uploads";
import { i18n } from "discourse-i18n";
import {
  buildCritiqueRaw,
  critiqueChoices,
  critiqueLocale,
  defaultCritiqueValues,
} from "../lib/spc-critique";
import SpcSubmitBase from "../lib/spc-submit-base";
import {
  categoryUrlFor,
  currentMonthYM,
  fetchSubjectTags,
  resolveRoundTag,
  sameTag,
  subjectOptions,
  tagCanonicalName,
  tagDisplayName,
} from "../lib/spc-submit-helpers";
import SpcSubmitShell from "./spc-submit-shell";

function withSelection(choices, current) {
  return choices.map((choice) => ({
    ...choice,
    selected: choice.value === current,
  }));
}

// One component, two modes, selected by the `type` query param on /submit:
//
//   /submit                  -> challenge (monthly photo challenge entry)
//   /submit/critique         -> critique  (single image submitted for critique)
//
// /submit?type=critique still resolves to critique mode for links shared before
// the dedicated path existed, which is what the `type` query param on
// controller:spc-submit is for.
//
// The two share everything structural — login gate, uploader, title, cancel
// confirmation, error handling — and differ only in the extra fields and in
// what buildRaw() emits. That shared part is no longer here: the chrome is
// SpcSubmitShell and the pipeline is SpcSubmitBase, so a third and fourth form
// can be written without copying either. The critique mode replaces the Custom
// Wizard "bild-zur-kritik-einreichen"; see lib/spc-critique.js for why its
// output has to stay byte-compatible with that wizard.

export default class SpcSubmitForm extends SpcSubmitBase {
  @service currentUser;

  @tracked description = "";
  @tracked resolvedTag = null;
  // null = unknown (not yet counted, or the count failed). The entry limit
  // only ever engages on a real number, so a failed count degrades to the
  // pre-limit behaviour instead of locking members out.
  @tracked roundEntryCount = null;

  // critique mode only
  @tracked subjects = [];
  @tracked subject = "";
  @tracked style = defaultCritiqueValues().style;
  @tracked focus = defaultCritiqueValues().focus;
  @tracked examples = defaultCritiqueValues().examples;
  @tracked about = "";
  @tracked feedback = "";
  @tracked technical = "";

  // Both loads used to hang off render modifiers on the page's outer element.
  // That element belongs to the shell now, and neither load has ever needed the
  // DOM: one asks Discourse for a tag list, the other for the round tag.
  constructor() {
    super(...arguments);
    if (this.isCritique) {
      this.loadSubjects();
    } else {
      resolveRoundTag(settings).then((tag) => {
        this.resolvedTag = tag;
        this.countRoundEntries(tag);
      });
    }
  }

  // How many entries the signed-in member already has in the current round:
  // their own recent topics, filtered to the challenge category and the round
  // tag. /topics/created-by/ is the right listing because it is one page of at
  // most 30 for exactly this user — a member with 30+ topics in a single month
  // is not a case this nudge needs to survive. Any failure leaves the count at
  // null, which keeps the form usable (see roundEntryCount above).
  async countRoundEntries(tag) {
    if (
      !tagCanonicalName(tag) ||
      !this.currentUser ||
      this.maxRoundEntries <= 0
    ) {
      return;
    }
    try {
      const username = encodeURIComponent(this.currentUser.username);
      const result = await ajax(`/topics/created-by/${username}.json`);
      const topics = result?.topic_list?.topics || [];
      this.roundEntryCount = topics.filter(
        (topic) =>
          topic.category_id === this.categoryId &&
          (topic.tags || []).some((topicTag) => sameTag(topicTag, tag))
      ).length;
    } catch {
      this.roundEntryCount = null;
    }
  }

  get maxRoundEntries() {
    return parseInt(settings.challenge_max_entries_per_round, 10) || 0;
  }

  get entryLimitReached() {
    return (
      !this.isCritique &&
      this.maxRoundEntries > 0 &&
      this.roundEntryCount !== null &&
      this.roundEntryCount >= this.maxRoundEntries
    );
  }

  get entryLimitNotice() {
    return i18n(themePrefix("form.entry_limit_notice"), {
      count: this.roundEntryCount,
    });
  }

  get isCritique() {
    return this.args.type === "critique";
  }

  get critiqueCategoryId() {
    return parseInt(settings.critique_category_id, 10);
  }

  loadSubjects() {
    fetchSubjectTags(this.critiqueCategoryId).then(
      (tags) => (this.subjects = tags)
    );
  }

  get categoryId() {
    return this.isCritique
      ? this.critiqueCategoryId
      : parseInt(settings.challenge_category_id, 10);
  }

  get categoryUrl() {
    return categoryUrlFor(this.categoryId);
  }

  get heading() {
    return this.isCritique
      ? i18n(themePrefix("critique_form.heading"))
      : i18n(themePrefix("form.heading"));
  }

  get submitLabel() {
    return this.isCritique
      ? i18n(themePrefix("critique_form.submit"))
      : i18n(themePrefix("form.submit"));
  }

  get roundLabel() {
    if (this.resolvedTag) {
      return tagDisplayName(this.resolvedTag);
    }
    if (window.moment) {
      return window.moment(`${currentMonthYM()}-01`).format("MMMM YYYY");
    }
    return currentMonthYM();
  }

  // The dropdowns are deliberately absent: they all start on a default, so a
  // form where only a dropdown has moved is not work worth warning about.
  get dirtyFields() {
    return [
      this.title,
      this.description,
      this.upload,
      this.about,
      this.feedback,
      this.technical,
    ];
  }

  get subjectOptions() {
    return subjectOptions(this.subjects, this.subject);
  }

  get noSubject() {
    return !this.subject;
  }

  get styleOptions() {
    return withSelection(critiqueChoices("styles"), this.style);
  }

  get focusOptions() {
    return withSelection(critiqueChoices("focus"), this.focus);
  }

  get examplesOptions() {
    return withSelection(critiqueChoices("examples"), this.examples);
  }

  @action
  updateDescription(event) {
    this.description = event.target.value;
  }

  @action
  updateSubject(event) {
    this.subject = event.target.value;
  }

  @action
  updateStyle(event) {
    this.style = event.target.value;
  }

  @action
  updateFocus(event) {
    this.focus = event.target.value;
  }

  @action
  updateExamples(event) {
    this.examples = event.target.value;
  }

  @action
  updateAbout(event) {
    this.about = event.target.value;
  }

  @action
  updateFeedback(event) {
    this.feedback = event.target.value;
  }

  @action
  updateTechnical(event) {
    this.technical = event.target.value;
  }

  async resolveTags() {
    if (this.isCritique) {
      return [this.subject];
    }
    // The constructor's lookup normally has an answer by now; if it does not,
    // ask again rather than posting an untagged entry into the round.
    const tag = this.resolvedTag || (await resolveRoundTag(settings));
    return [tagCanonicalName(tag)];
  }

  buildRaw() {
    if (this.isCritique) {
      return buildCritiqueRaw({
        imageMarkdown: getUploadMarkdown(this.upload),
        style: this.style,
        focus: this.focus,
        examples: this.examples,
        about: this.about,
        feedback: this.feedback,
        technical: this.technical,
        locale: critiqueLocale(),
      });
    }

    let raw = getUploadMarkdown(this.upload);
    if (this.description?.trim()) {
      raw += `\n\n${this.description.trim()}`;
    }
    return raw;
  }

  validate() {
    // The shell already disables the button when the limit is reached; this
    // covers the button press that races the count's arrival.
    if (this.entryLimitReached) {
      return this.entryLimitNotice;
    }
    const problem = super.validate();
    if (problem) {
      return problem;
    }
    if (!this.upload) {
      return i18n(themePrefix("form.error_no_photo"));
    }
    if (this.isCritique) {
      if (!this.subject) {
        return i18n(themePrefix("critique_form.error_no_subject"));
      }
      if (!this.feedback?.trim()) {
        return i18n(themePrefix("critique_form.error_no_feedback"));
      }
    }
    return null;
  }

  <template>
    <SpcSubmitShell
      @heading={{this.heading}}
      @submitLabel={{this.submitLabel}}
      @submitting={{this.submitting}}
      @submitDisabled={{this.entryLimitReached}}
      @error={{this.error}}
      @onSubmit={{this.submit}}
      @onCancel={{this.cancel}}
    >
      <:meta>
        {{#unless this.isCritique}}
          <span class="spc-submit-page__round">
            {{i18n (themePrefix "form.round_label")}}:
            <span class="spc-submit-page__round-tag">{{this.roundLabel}}</span>
          </span>
        {{/unless}}
      </:meta>

      <:fields>
        {{#if this.isCritique}}
          <div class="spc-submit-page__intro">
            <h2>{{i18n (themePrefix "critique_form.intro_title")}}</h2>
            <p>{{i18n (themePrefix "critique_form.intro_exchange")}}</p>
            <p>{{i18n (themePrefix "critique_form.intro_limit")}}</p>
          </div>
        {{/if}}

        {{#if this.entryLimitReached}}
          <div class="spc-submit-page__notice" role="alert">
            {{this.entryLimitNotice}}
          </div>
        {{/if}}

        <div class="spc-submit-page__field">
          <label for="spc-submit-title">
            {{#if this.isCritique}}
              {{i18n (themePrefix "critique_form.title_label")}}
            {{else}}
              {{i18n (themePrefix "form.title_label")}}
            {{/if}}
          </label>
          <input
            id="spc-submit-title"
            type="text"
            maxlength="255"
            value={{this.title}}
            placeholder={{i18n (themePrefix "form.title_placeholder")}}
            {{on "input" this.updateTitle}}
          />
        </div>

        <div class="spc-submit-page__field">
          <label>
            {{#if this.isCritique}}
              {{i18n (themePrefix "critique_form.photo_label")}}
            {{else}}
              {{i18n (themePrefix "form.photo_label")}}
            {{/if}}
          </label>
          <p class="spc-submit-page__hint">
            {{#if this.isCritique}}
              {{i18n (themePrefix "critique_form.photo_hint")}}
            {{else}}
              {{i18n (themePrefix "form.photo_hint")}}
            {{/if}}
          </p>
          <UppyImageUploader
            @id="spc-photo-upload"
            @type="composer"
            @imageUrl={{this.imageUrl}}
            @onUploadDone={{this.uploadDone}}
            @onUploadDeleted={{this.uploadDeleted}}
            class="spc-submit-page__uploader"
          />
        </div>

        {{#if this.isCritique}}
          <div class="spc-submit-page__field">
            <label for="spc-critique-subject">
              {{i18n (themePrefix "critique_form.subject_label")}}
            </label>
            <select id="spc-critique-subject" {{on "change" this.updateSubject}}>
              <option value="" selected={{this.noSubject}}>
                {{i18n (themePrefix "critique_form.subject_placeholder")}}
              </option>
              {{! The block param must not be called `option`. These are
                  strict-mode templates, so a tag that matches an in-scope
                  variable is compiled as a component invocation rather than
                  an HTML element - `<option>` inside `as |option|` resolved
                  to a plain object, Glimmer read `.manager` off a null
                  definition and the whole render threw. On a direct load
                  that killed the root render, and Ember re-appended the
                  top-level outlet, which is why the entire app shell used to
                  appear three times over on the critique form. }}
              {{#each this.subjectOptions as |choice|}}
                <option value={{choice.value}} selected={{choice.selected}}>
                  {{choice.label}}
                </option>
              {{/each}}
            </select>
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-critique-style">
              {{i18n (themePrefix "critique_form.style_label")}}
            </label>
            <select id="spc-critique-style" {{on "change" this.updateStyle}}>
              {{#each this.styleOptions as |choice|}}
                <option value={{choice.value}} selected={{choice.selected}}>
                  {{choice.label}}
                </option>
              {{/each}}
            </select>
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-critique-focus">
              {{i18n (themePrefix "critique_form.focus_label")}}
            </label>
            <select id="spc-critique-focus" {{on "change" this.updateFocus}}>
              {{#each this.focusOptions as |choice|}}
                <option value={{choice.value}} selected={{choice.selected}}>
                  {{choice.label}}
                </option>
              {{/each}}
            </select>
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-critique-examples">
              {{i18n (themePrefix "critique_form.examples_label")}}
            </label>
            <select
              id="spc-critique-examples"
              {{on "change" this.updateExamples}}
            >
              {{#each this.examplesOptions as |choice|}}
                <option value={{choice.value}} selected={{choice.selected}}>
                  {{choice.label}}
                </option>
              {{/each}}
            </select>
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-critique-about">
              {{i18n (themePrefix "critique_form.about_label")}}
            </label>
            <textarea
              id="spc-critique-about"
              rows="4"
              {{on "input" this.updateAbout}}
            >{{this.about}}</textarea>
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-critique-feedback">
              {{i18n (themePrefix "critique_form.feedback_label")}}
            </label>
            <textarea
              id="spc-critique-feedback"
              rows="5"
              placeholder={{i18n
                (themePrefix "critique_form.feedback_placeholder")
              }}
              {{on "input" this.updateFeedback}}
            >{{this.feedback}}</textarea>
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-critique-technical">
              {{i18n (themePrefix "critique_form.technical_label")}}
            </label>
            <textarea
              id="spc-critique-technical"
              rows="3"
              placeholder={{i18n
                (themePrefix "critique_form.technical_placeholder")
              }}
              {{on "input" this.updateTechnical}}
            >{{this.technical}}</textarea>
          </div>
        {{else}}
          <div class="spc-submit-page__field">
            <label for="spc-submit-description">
              {{i18n (themePrefix "form.description_label")}}
            </label>
            <textarea
              id="spc-submit-description"
              rows="6"
              placeholder={{i18n (themePrefix "form.description_placeholder")}}
              {{on "input" this.updateDescription}}
            >{{this.description}}</textarea>
          </div>
        {{/if}}
      </:fields>
    </SpcSubmitShell>
  </template>
}
