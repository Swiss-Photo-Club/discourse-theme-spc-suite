import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { i18n } from "discourse-i18n";
import {
  buildFeedbackRaw,
  FEEDBACK_TYPES,
  feedbackLocale,
} from "../lib/spc-feedback";
import SpcSubmitBase from "../lib/spc-submit-base";
import { categoryUrlFor } from "../lib/spc-submit-helpers";
import SpcCardChoice from "./spc-card-choice";
import SpcSubmitShell from "./spc-submit-shell";

// Website feedback — the friendly front door to the feedback category, in
// place of the composer. The composer would ask for a required tag from a
// dropdown, a title and a blank body; this asks the same three things in the
// order a member thinks about them (what kind of thing is this → what is it →
// tell us more), explains each, and lets the "tell us more" hint change with
// the kind: an idea wants "what and why", a problem wants "what happened and
// what you expected".
//
// The type card is the only thing that becomes structure — it lands as the
// topic's tag, which the category requires (min 1 from "Feedback Type") and
// which staff and the Votes list filter by. Everything else is free text; see
// lib/spc-feedback.js for the little that gets written around it.
//
// No default type. Preselecting "idea" would make the form one field shorter
// for the common case and quietly mis-tag every problem report whose author
// did not look at the cards. The choice is the point.

export default class SpcFeedbackForm extends SpcSubmitBase {
  @tracked type = "";
  @tracked details = "";
  @tracked where = "";

  get categoryId() {
    return parseInt(settings.feedback_category_id, 10);
  }

  get categoryUrl() {
    return categoryUrlFor(this.categoryId);
  }

  get heading() {
    return i18n(themePrefix("feedback_form.heading"));
  }

  get lead() {
    return i18n(themePrefix("feedback_form.lead"));
  }

  get submitLabel() {
    return i18n(themePrefix("feedback_form.submit"));
  }

  get titleError() {
    return i18n(themePrefix("feedback_form.error_no_title"));
  }

  get typeChoices() {
    return FEEDBACK_TYPES.map((type) => ({
      value: type,
      title: i18n(themePrefix(`feedback_form.types.${type}.title`)),
      description: i18n(themePrefix(`feedback_form.types.${type}.description`)),
      selected: this.type === type,
    }));
  }

  // The details field speaks to the chosen type; before one is chosen it asks
  // the generic question, so the form never shows an empty label.
  get detailsKey() {
    return this.type || "generic";
  }

  get detailsLabel() {
    return i18n(themePrefix(`feedback_form.details.${this.detailsKey}.label`));
  }

  get detailsHint() {
    return i18n(themePrefix(`feedback_form.details.${this.detailsKey}.hint`));
  }

  get dirtyFields() {
    return [this.type, this.title, this.details, this.where, this.upload];
  }

  @action
  updateType(event) {
    this.type = event.target.value;
    this.error = null;
  }

  @action
  updateField(name, event) {
    this[name] = event.target.value;
  }

  // The tag is required by the category, so /posts.json would reject a post
  // without one — validate() makes sure that never reaches the server as an
  // opaque error.
  async resolveTags() {
    return [this.type];
  }

  buildRaw() {
    return buildFeedbackRaw({
      details: this.details,
      where: this.where,
      upload: this.upload,
      locale: feedbackLocale(),
    });
  }

  validate() {
    if (!this.type) {
      return i18n(themePrefix("feedback_form.error_no_type"));
    }
    const problem = super.validate();
    if (problem) {
      return problem;
    }
    if (!this.details?.trim()) {
      return i18n(themePrefix("feedback_form.error_no_details"));
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
      @submitIcon="paper-plane"
    >
      <:fields>
        <div class="spc-submit-page__field">
          <label>
            {{i18n (themePrefix "feedback_form.type_label")}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.required")}}
            </span>
          </label>
          <SpcCardChoice
            @name="spc-feedback-type"
            @choices={{this.typeChoices}}
            @onChange={{this.updateType}}
          />
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-feedback-title">
            {{i18n (themePrefix "feedback_form.title_label")}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.required")}}
            </span>
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "feedback_form.title_hint")}}
          </p>
          <input
            id="spc-feedback-title"
            type="text"
            maxlength="255"
            value={{this.title}}
            placeholder={{i18n (themePrefix "feedback_form.title_placeholder")}}
            {{on "input" this.updateTitle}}
          />
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-feedback-details">
            {{this.detailsLabel}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.required")}}
            </span>
          </label>
          <p class="spc-submit-page__hint">{{this.detailsHint}}</p>
          <textarea
            id="spc-feedback-details"
            rows="7"
            {{on "input" (fn this.updateField "details")}}
          >{{this.details}}</textarea>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-feedback-where">
            {{i18n (themePrefix "feedback_form.where_label")}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.optional")}}
            </span>
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "feedback_form.where_hint")}}
          </p>
          <input
            id="spc-feedback-where"
            type="text"
            maxlength="255"
            value={{this.where}}
            placeholder={{i18n (themePrefix "feedback_form.where_placeholder")}}
            {{on "input" (fn this.updateField "where")}}
          />
        </div>

        <div class="spc-submit-page__field">
          <label>
            {{i18n (themePrefix "feedback_form.screenshot_label")}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.optional")}}
            </span>
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "feedback_form.screenshot_hint")}}
          </p>
          <UppyImageUploader
            @id="spc-feedback-upload"
            @type="composer"
            @imageUrl={{this.imageUrl}}
            @onUploadDone={{this.uploadDone}}
            @onUploadDeleted={{this.uploadDeleted}}
            class="spc-submit-page__uploader"
          />
        </div>

        <p class="spc-submit-page__outro">
          {{i18n (themePrefix "feedback_form.outro")}}
        </p>
      </:fields>
    </SpcSubmitShell>
  </template>
}
