import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import DButton from "discourse/components/d-button";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import { getUploadMarkdown } from "discourse/lib/uploads";
import DiscourseURL from "discourse/lib/url";
import I18n, { i18n } from "discourse-i18n";
import {
  buildCritiqueRaw,
  critiqueChoices,
  critiqueLocale,
  defaultCritiqueValues,
} from "../lib/spc-critique";
import { currentMonthYM, resolveRoundTag } from "../lib/spc-submit-helpers";

function withSelection(choices, current) {
  return choices.map((choice) => ({
    ...choice,
    selected: choice.value === current,
  }));
}

// One component, two modes, selected by the `type` query param on /submit:
//
//   /submit                  -> challenge (monthly photo challenge entry)
//   /submit?type=critique    -> critique  (single image submitted for critique)
//
// The two share everything structural — login gate, uploader, title, cancel
// confirmation, error handling — and differ only in the extra fields and in
// what buildRaw() emits. The critique mode replaces the Custom Wizard
// "bild-zur-kritik-einreichen"; see lib/spc-critique.js for why its output has
// to stay byte-compatible with that wizard.

export default class SpcSubmitForm extends Component {
  @service currentUser;
  @service dialog;

  @tracked title = "";
  @tracked description = "";
  @tracked upload = null;
  @tracked submitting = false;
  @tracked error = null;
  @tracked resolvedTag = null;

  // critique mode only
  @tracked subjects = [];
  @tracked subject = "";
  @tracked style = defaultCritiqueValues().style;
  @tracked focus = defaultCritiqueValues().focus;
  @tracked examples = defaultCritiqueValues().examples;
  @tracked about = "";
  @tracked feedback = "";
  @tracked technical = "";

  get isCritique() {
    return this.args.type === "critique";
  }

  get critiqueCategoryId() {
    return parseInt(settings.critique_category_id, 10);
  }

  loadRoundTag = modifier(() => {
    if (this.isCritique) {
      return;
    }
    resolveRoundTag(settings).then((tag) => (this.resolvedTag = tag));
  });

  // The subject list is fetched rather than hard-coded on purpose. The critique
  // category requires at least one tag from the "Critique Subjects" tag group,
  // and /posts.json enforces that server-side. Asking Discourse which tags it
  // will accept means this form can never offer one it would then reject — if
  // a subject is added to or removed from the tag group in admin, the dropdown
  // follows without a code change.
  loadSubjects = modifier(() => {
    if (!this.isCritique) {
      return;
    }
    ajax("/tags/filter/search.json", {
      data: {
        q: "",
        categoryId: this.critiqueCategoryId,
        filterForInput: true,
      },
    })
      .then((result) => {
        this.subjects = (result?.results || [])
          .map((tag) => tag.name)
          .filter(Boolean);
      })
      .catch(() => (this.subjects = []));
  });

  get categoryUrl() {
    if (this.isCritique) {
      const slug = (settings.critique_category_slug || "").trim();
      const id = this.critiqueCategoryId;
      return slug ? `/c/${slug}/${id}` : `/c/${id}`;
    }
    const slug = (settings.challenge_category_slug || "").trim();
    const id = parseInt(settings.challenge_category_id, 10);
    return slug ? `/c/${slug}/${id}` : `/c/${id}`;
  }

  get heading() {
    return this.isCritique
      ? i18n(themePrefix("critique_form.heading"))
      : i18n(themePrefix("form.heading"));
  }

  get roundLabel() {
    if (this.resolvedTag) {
      return this.resolvedTag;
    }
    if (window.moment) {
      return window.moment(`${currentMonthYM()}-01`).format("MMMM YYYY");
    }
    return currentMonthYM();
  }

  get imageUrl() {
    return this.upload?.url;
  }

  get dirty() {
    return (
      this.title ||
      this.description ||
      this.upload ||
      this.about ||
      this.feedback ||
      this.technical
    );
  }

  get subjectOptions() {
    return this.subjects.map((tag) => {
      const key = themePrefix(`critique_form.subjects.${tag}`);
      const label = I18n.t(key);
      return {
        value: tag,
        label: label && label !== key ? label : tag,
        selected: tag === this.subject,
      };
    });
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
  updateTitle(event) {
    this.title = event.target.value;
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

  @action
  uploadDone(upload) {
    this.upload = upload;
    this.error = null;
  }

  @action
  uploadDeleted() {
    this.upload = null;
  }

  @action
  goToLogin() {
    DiscourseURL.routeTo("/login");
  }

  @action
  cancel() {
    if (this.dirty) {
      this.dialog.yesNoConfirm({
        message: i18n(themePrefix("form.discard_confirm")),
        didConfirm: () => DiscourseURL.routeTo(this.categoryUrl),
      });
    } else {
      DiscourseURL.routeTo(this.categoryUrl);
    }
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
    if (!this.title?.trim()) {
      return i18n(themePrefix("form.error_no_title"));
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

  @action
  async submit() {
    const problem = this.validate();
    if (problem) {
      this.error = problem;
      return;
    }

    this.error = null;
    this.submitting = true;

    const data = {
      title: this.title.trim(),
      raw: this.buildRaw(),
      category: this.isCritique
        ? this.critiqueCategoryId
        : parseInt(settings.challenge_category_id, 10),
      tags: [this.isCritique ? this.subject : this.resolvedTag],
    };

    if (!this.isCritique && !data.tags[0]) {
      data.tags = [await resolveRoundTag(settings)];
    }

    try {
      const post = await ajax("/posts.json", { type: "POST", data });
      DiscourseURL.routeTo(`/t/${post.topic_slug}/${post.topic_id}`);
    } catch (e) {
      this.error = extractError(e);
      this.submitting = false;
    }
  }

  <template>
    <div
      class="spc-submit-page"
      {{this.loadRoundTag}}
      {{this.loadSubjects}}
    >
      <div class="spc-submit-page__inner">
        <div class="spc-submit-page__header">
          <h1>{{this.heading}}</h1>
          {{#unless this.isCritique}}
            <span class="spc-submit-page__round">
              {{i18n (themePrefix "form.round_label")}}:
              <span class="spc-submit-page__round-tag">{{this.roundLabel}}</span>
            </span>
          {{/unless}}
          <DButton
            @icon="xmark"
            @action={{this.cancel}}
            class="btn-flat spc-submit-page__close"
          />
        </div>

        {{#if this.currentUser}}
          {{#if this.isCritique}}
            <div class="spc-submit-page__intro">
              <h2>{{i18n (themePrefix "critique_form.intro_title")}}</h2>
              <p>{{i18n (themePrefix "critique_form.intro_exchange")}}</p>
              <p>{{i18n (themePrefix "critique_form.intro_limit")}}</p>
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
                {{#each this.subjectOptions as |option|}}
                  <option value={{option.value}} selected={{option.selected}}>
                    {{option.label}}
                  </option>
                {{/each}}
              </select>
            </div>

            <div class="spc-submit-page__field">
              <label for="spc-critique-style">
                {{i18n (themePrefix "critique_form.style_label")}}
              </label>
              <select id="spc-critique-style" {{on "change" this.updateStyle}}>
                {{#each this.styleOptions as |option|}}
                  <option value={{option.value}} selected={{option.selected}}>
                    {{option.label}}
                  </option>
                {{/each}}
              </select>
            </div>

            <div class="spc-submit-page__field">
              <label for="spc-critique-focus">
                {{i18n (themePrefix "critique_form.focus_label")}}
              </label>
              <select id="spc-critique-focus" {{on "change" this.updateFocus}}>
                {{#each this.focusOptions as |option|}}
                  <option value={{option.value}} selected={{option.selected}}>
                    {{option.label}}
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
                {{#each this.examplesOptions as |option|}}
                  <option value={{option.value}} selected={{option.selected}}>
                    {{option.label}}
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

          {{#if this.error}}
            <div class="spc-submit-page__error alert alert-error">
              {{this.error}}
            </div>
          {{/if}}

          <div class="spc-submit-page__actions">
            <DButton
              @icon="camera"
              @translatedLabel={{if
                this.submitting
                (i18n (themePrefix "form.submitting"))
                (if
                  this.isCritique
                  (i18n (themePrefix "critique_form.submit"))
                  (i18n (themePrefix "form.submit"))
                )
              }}
              @action={{this.submit}}
              @disabled={{this.submitting}}
              @isLoading={{this.submitting}}
              class="btn-primary btn-large spc-submit-page__submit"
            />
            <DButton
              @translatedLabel={{i18n (themePrefix "form.cancel")}}
              @action={{this.cancel}}
              class="btn-flat"
            />
          </div>
        {{else}}
          <div class="spc-submit-page__login">
            <p>{{i18n (themePrefix "form.login_required")}}</p>
            <DButton
              @translatedLabel={{i18n (themePrefix "form.login_button")}}
              @action={{this.goToLogin}}
              class="btn-primary"
            />
          </div>
        {{/if}}
      </div>
    </div>
  </template>
}
