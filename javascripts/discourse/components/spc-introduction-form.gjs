import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { i18n } from "discourse-i18n";
import {
  buildIntroductionRaw,
  introductionLocale,
} from "../lib/spc-introduction";
import SpcSubmitBase from "../lib/spc-submit-base";
import { categoryUrlFor } from "../lib/spc-submit-helpers";
import SpcSubmitShell from "./spc-submit-shell";

// Introduce yourself — the replacement for the Custom Wizard
// "vorstellung-einreichen". Four fields, two of them optional, and no tags:
// category 12 does not require one, which is why resolveTags() is left at the
// base class's empty default and the tags key never reaches /posts.json.
//
// No sections and no card choosers, unlike the project form. Those earn their
// keep on a form with ten fields and two ways to submit; on this one they would
// be chrome around a single short block. The shared shell, the (required)
// markers and the single-image uploader are the same, which is what "the three
// forms look alike" actually means here.
//
// See lib/spc-introduction.js for why the image markdown is hand-built rather
// than taken from getUploadMarkdown().

export default class SpcIntroductionForm extends SpcSubmitBase {
  @tracked about = "";
  @tracked goals = "";

  get categoryId() {
    return parseInt(settings.critique_intro_category_id, 10);
  }

  get categoryUrl() {
    return categoryUrlFor(this.categoryId);
  }

  get heading() {
    return i18n(themePrefix("intro_form.heading"));
  }

  get lead() {
    return i18n(themePrefix("intro_form.lead"));
  }

  get submitLabel() {
    return i18n(themePrefix("intro_form.submit"));
  }

  get titleError() {
    return i18n(themePrefix("intro_form.error_no_title"));
  }

  get dirtyFields() {
    return [this.title, this.about, this.goals, this.upload];
  }

  @action
  updateField(name, event) {
    this[name] = event.target.value;
  }

  buildRaw() {
    return buildIntroductionRaw({
      upload: this.upload,
      about: this.about,
      goals: this.goals,
      locale: introductionLocale(),
    });
  }

  validate() {
    const problem = super.validate();
    if (problem) {
      return problem;
    }
    if (!this.about?.trim()) {
      return i18n(themePrefix("intro_form.error_no_about"));
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
      @submitIcon="user-plus"
    >
      <:fields>
        <div class="spc-submit-page__field">
          <label for="spc-intro-title">
            {{i18n (themePrefix "intro_form.title_label")}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.required")}}
            </span>
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "intro_form.title_hint")}}
          </p>
          <input
            id="spc-intro-title"
            type="text"
            maxlength="255"
            value={{this.title}}
            placeholder={{i18n (themePrefix "intro_form.title_placeholder")}}
            {{on "input" this.updateTitle}}
          />
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-intro-about">
            {{i18n (themePrefix "intro_form.about_label")}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.required")}}
            </span>
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "intro_form.about_hint")}}
          </p>
          <textarea
            id="spc-intro-about"
            rows="6"
            {{on "input" (fn this.updateField "about")}}
          >{{this.about}}</textarea>
        </div>

        <div class="spc-submit-page__field">
          <label for="spc-intro-goals">
            {{i18n (themePrefix "intro_form.goals_label")}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.optional")}}
            </span>
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "intro_form.goals_hint")}}
          </p>
          <textarea
            id="spc-intro-goals"
            rows="4"
            {{on "input" (fn this.updateField "goals")}}
          >{{this.goals}}</textarea>
        </div>

        <div class="spc-submit-page__field">
          <label>
            {{i18n (themePrefix "intro_form.photo_label")}}
            <span class="spc-submit-page__required">
              {{i18n (themePrefix "form.optional")}}
            </span>
          </label>
          <p class="spc-submit-page__hint">
            {{i18n (themePrefix "intro_form.photo_hint")}}
          </p>
          <UppyImageUploader
            @id="spc-intro-upload"
            @type="composer"
            @imageUrl={{this.imageUrl}}
            @onUploadDone={{this.uploadDone}}
            @onUploadDeleted={{this.uploadDeleted}}
            class="spc-submit-page__uploader"
          />
        </div>

        <p class="spc-submit-page__outro">
          {{i18n (themePrefix "intro_form.outro")}}
        </p>
      </:fields>
    </SpcSubmitShell>
  </template>
}
